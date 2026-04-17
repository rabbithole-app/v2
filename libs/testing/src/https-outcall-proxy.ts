import type { PocketIc } from "@dfinity/pic";

export interface DrainProxyOptions {
  /** Stop after this many consecutive rounds without HTTPS outcalls (default: 50). */
  maxIdleRounds?: number;
  /** Maximum number of tick+proxy rounds (default: 300) */
  maxRounds?: number;
  /** Number of ticks per round (default: 4) */
  ticksPerRound?: number;
}

/**
 * Run tick+proxy rounds to fully process a submitted canister call.
 *
 * Canister methods with multiple sequential `await` calls have long gaps between
 * HTTPS outcalls where inter-canister calls (ECDSA sign, etc.) need ticks.
 * The idle threshold must be high enough to cover these gaps.
 *
 * For complex operations (multi-step EVM transactions with ECDSA signing),
 * use {@link runWithProxy} which ties the drain loop to the actual call completion.
 */
export async function drainProxy(
  pic: PocketIc,
  opts?: DrainProxyOptions,
): Promise<void> {
  const maxRounds = opts?.maxRounds ?? 300;
  const maxIdleRounds = opts?.maxIdleRounds ?? 50;
  const ticksPerRound = opts?.ticksPerRound ?? 4;
  let idleRounds = 0;

  for (let i = 0; i < maxRounds; i++) {
    await pic.tick(ticksPerRound);
    const proxied = await proxyHttpsOutcalls(pic);
    if (proxied === 0) {
      idleRounds++;
      if (idleRounds >= maxIdleRounds) break;
    } else {
      idleRounds = 0;
    }
  }
}

/**
 * Proxy pending HTTPS outcalls through real HTTP fetch.
 *
 * PocketIC intercepts canister HTTPS outcalls and puts them in a pending queue.
 * This function fetches all pending outcalls, performs the real HTTP request,
 * and feeds the response back to PocketIC.
 *
 * @returns Number of proxied outcalls
 */
export async function proxyHttpsOutcalls(pic: PocketIc): Promise<number> {
  const pending = await pic.getPendingHttpsOutcalls();
  let proxied = 0;

  if (pending.length > 0) {
    console.log(`[proxyHttpsOutcalls] found ${pending.length} pending outcalls: ${pending.map(o => `reqId=${o.requestId}`).join(", ")}`);
  }

  for (const outcall of pending) {
    const headers: Record<string, string> = {};
    for (const [name, value] of outcall.headers) {
      headers[name] = value;
    }

    try {
      console.log(`[proxyHttpsOutcalls] fetching reqId=${outcall.requestId} ${outcall.httpMethod} ${outcall.url.substring(0, 80)}...`);
      const response = await fetch(outcall.url, {
        method: outcall.httpMethod,
        headers,
        body: outcall.body.length > 0 ? Buffer.from(outcall.body) : undefined,
        signal: AbortSignal.timeout(10_000),
      });

      const responseHeaders: [string, string][] = [];
      response.headers.forEach((value, key) => {
        responseHeaders.push([key, value]);
      });

      const body = new Uint8Array(await response.arrayBuffer());

      try {
        await pic.mockPendingHttpsOutcall({
          requestId: outcall.requestId,
          subnetId: outcall.subnetId,
          response: {
            type: "success",
            statusCode: response.status,
            headers: responseHeaders,
            body,
          },
        });
        proxied++;
        console.log(`[proxyHttpsOutcalls] mock OK reqId=${outcall.requestId} status=${response.status}`);
      } catch (mockErr) {
        console.log(`[proxyHttpsOutcalls] mock FAILED for reqId=${outcall.requestId}: ${mockErr instanceof Error ? mockErr.message : String(mockErr)}`);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      console.log(`[proxyHttpsOutcalls] fetch FAILED for ${outcall.url}: ${message}`);

      try {
        await pic.mockPendingHttpsOutcall({
          requestId: outcall.requestId,
          subnetId: outcall.subnetId,
          response: {
            type: "reject",
            statusCode: 1, // SysTransient
            message: `HTTPS outcall proxy fetch failed: ${message}`,
          },
        });
        proxied++;
      } catch {
        // Outcall already invalidated
      }
    }
  }

  return proxied;
}

/** Default timeout for runWithProxy — must be shorter than vitest testTimeout */
const RUN_WITH_PROXY_TIMEOUT_MS = 180_000;

/**
 * Execute a DeferredActor call with PocketIC auto-progress mode.
 *
 * The core problem: In manual (deterministic) mode, PocketIC's `tick()`
 * processes all pending messages in one round. When a canister's call chain
 * creates an HTTPS outcall within that tick, the tick blocks until the mock
 * response is provided — but mock can only be provided after tick returns.
 * This is a deadlock.
 *
 * Solution: Enable PocketIC's **auto-progress** mode for the duration of
 * the call. In this mode, PocketIC automatically:
 * 1. Advances time to real time
 * 2. Processes rounds (ticks) automatically
 * 3. Makes **real HTTP requests** for pending HTTPS outcalls
 *
 * This completely bypasses the deadlock: PocketIC handles HTTPS outcalls
 * internally as part of its automatic round processing. The canister's
 * inter-canister calls (ECDSA, EVM RPC) and HTTPS outcalls all resolve
 * naturally.
 *
 * After the call completes (or times out), auto-progress is disabled to
 * return to deterministic mode for subsequent non-EVM tests.
 *
 * Usage:
 * ```ts
 * const result = await runWithProxy(pic, async (proxy) => {
 *   const getResult = await deferredActor.someMethod(args);
 *   return proxy(getResult);
 * });
 * ```
 */
export async function runWithProxy<T>(
  pic: PocketIc,
  fn: (
    proxy: <R>(
      getResult: () => Promise<R>,
      opts?: DrainProxyOptions,
    ) => Promise<R>,
  ) => Promise<T>,
): Promise<T> {
  // Enable auto-progress BEFORE fn() runs, so that the ingress message
  // submitted by deferredActor.someMethod() uses the real clock time.
  // If auto-progress is enabled after submitCall, the IC time may have
  // jumped forward past the ingress message's expiry, causing it to be
  // silently dropped.
  const client = getPicClient(pic);
  const { encodeAwaitCanisterCallRequest } = await getPicInternals();
  const originalAwaitCall = client.awaitCall.bind(client);

  // In auto-progress mode, PocketIC ticks automatically.
  // We replace awaitCall with a pure ingressStatus polling loop
  // (no manual tick calls) to avoid 409 conflicts with auto-progress.
  client.awaitCall = async (req: unknown): Promise<unknown> => {
    console.log("[runWithProxy] patched awaitCall: polling ingressStatus...");
    const encodedReq = {
      messageId: encodeAwaitCanisterCallRequest(req),
      caller: undefined,
    };

    // Use a generous retry count: auto-progress ECDSA key derivation
    // can take 60+ seconds, and each poll is ~200ms apart.
    const maxRetries = Math.max(client.ingressMaxRetries ?? 500, 1000);
    for (let i = 0; i < maxRetries; i++) {
      // Small delay to let auto-progress tick
      await new Promise(r => setTimeout(r, 200));

      const result = await client.ingressStatus(encodedReq);
      if (result !== null && result !== undefined) {
        console.log(`[runWithProxy] completed after ${i + 1} polls`);
        return result;
      }
      if (i < 5 || i % 100 === 0) {
        console.log(`[runWithProxy] poll ${i}: pending`);
      }
    }
    throw new Error(
      `runWithProxy: call did not complete within ${maxRetries} polls`,
    );
  };

  console.log("[runWithProxy] enabling auto_progress...");
  await enableAutoProgress(pic);

  const proxy = async <R>(
    getResult: () => Promise<R>,
    _opts?: DrainProxyOptions,
  ): Promise<R> => {
    return getResult();
  };

  try {
    const result = await Promise.race([
      fn(proxy),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => {
          reject(new Error(`runWithProxy: timed out after ${RUN_WITH_PROXY_TIMEOUT_MS}ms`));
        }, RUN_WITH_PROXY_TIMEOUT_MS);
      }),
    ]);
    console.log("[runWithProxy] call completed successfully");
    return result;
  } finally {
    console.log("[runWithProxy] disabling auto_progress...");
    try {
      await disableAutoProgress(pic);
    } catch (e) {
      console.log(`[runWithProxy] warning: stop_progress failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    // Restore original awaitCall for subsequent non-EVM tests
    client.awaitCall = originalAwaitCall;
    console.log("[runWithProxy] cleanup done");
  }
}

/**
 * Enable auto-progress, poll until a condition is met, then disable auto-progress.
 *
 * Useful for timer-based flows where the canister schedules work via Timer.setTimer
 * and that work involves HTTPS outcalls (EVM RPC, Solana RPC, XRC).
 * Auto-progress mode lets PocketIC tick and proxy outcalls automatically.
 *
 * Usage:
 * ```ts
 * await actor.triggerAutoRenewals(); // schedules timers
 * await waitWithAutoProgress(pic, async () => {
 *   const sub = await actor.getSubscription();
 *   return sub[0]?.status?.Active !== undefined;
 * });
 * ```
 */
export async function waitWithAutoProgress(
  pic: PocketIc,
  condition: () => Promise<boolean>,
  opts?: { pollIntervalMs?: number; timeoutMs?: number; },
): Promise<void> {
  const timeoutMs = opts?.timeoutMs ?? 120_000;
  const pollIntervalMs = opts?.pollIntervalMs ?? 500;

  await enableAutoProgress(pic);
  try {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, pollIntervalMs));
      try {
        if (await condition()) return;
      } catch {
        // condition may throw while timers are still in progress
      }
    }
    throw new Error(`waitWithAutoProgress: condition not met within ${timeoutMs}ms`);
  } finally {
    try {
      await disableAutoProgress(pic);
    } catch (e) {
      console.log(`[waitWithAutoProgress] warning: stop_progress failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

/**
 * Disable PocketIC auto-progress mode for the given instance.
 */
async function disableAutoProgress(pic: PocketIc): Promise<void> {
  const client = getPicClient(pic);
  await client.serverClient.jsonPost({
    path: `${client.instancePath}/stop_progress`,
    body: {},
  });
}

/**
 * Enable PocketIC auto-progress mode for the given instance.
 *
 * In auto-progress mode, PocketIC automatically:
 * - Advances time to real time
 * - Processes rounds (ticks)
 * - Makes real HTTP requests for pending canister HTTPS outcalls
 */
async function enableAutoProgress(pic: PocketIc): Promise<void> {
  const client = getPicClient(pic);
  await client.serverClient.jsonPost({
    path: `${client.instancePath}/auto_progress`,
    body: {},
  });
}

// Cache for lazily loaded @dfinity/pic internals
let _picInternals: {
  encodeAwaitCanisterCallRequest: (req: unknown) => unknown;
} | null = null;

/**
 * Access PocketIcClient internals from a PocketIc instance.
 */
function getPicClient(pic: PocketIc) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = (pic as any).client;
  if (!client || !client.serverClient || !client.instancePath) {
    throw new Error(
      "runWithProxy: cannot access PocketIcClient internals — @dfinity/pic may have changed",
    );
  }
  return client as {
    awaitCall(req: unknown): Promise<unknown>;
    ingressMaxRetries: number;
    ingressStatus(req: unknown): Promise<unknown>;
    instancePath: string;
    serverClient: {
      jsonPost(init: { body?: unknown; path: string; }): Promise<unknown>;
    };
    tick(): Promise<unknown>;
  };
}

/**
 * Lazily load @dfinity/pic internal helpers needed for the patched awaitCall.
 */
async function getPicInternals() {
  if (!_picInternals) {
    const types = await import(
      "@dfinity/pic/dist/pocket-ic-client-types.js"
    );
    _picInternals = {
      encodeAwaitCanisterCallRequest: types.encodeAwaitCanisterCallRequest,
    };
  }
  return _picInternals;
}
