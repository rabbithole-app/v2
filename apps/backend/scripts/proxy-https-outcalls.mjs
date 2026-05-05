import { readFile } from 'node:fs/promises';

const STATUS_FILE = process.env.ICP_STATUS_FILE ?? 'apps/backend/.icp-status/status.json';
const NETWORK_HOST = process.env.POCKETIC_HOST ?? 'network';
const POLL_MS = Number(process.env.HTTPS_OUTCALL_PROXY_POLL_MS ?? '500');
const REQUEST_TIMEOUT_MS = Number(process.env.HTTPS_OUTCALL_PROXY_REQUEST_TIMEOUT_MS ?? '30000');
const RETRY_MS = 10;

let status = await readStatus();
let serverUrl = status.serverUrl;
let baseUrl = status.baseUrl;

console.log(`[https-outcall-proxy] polling ${baseUrl}`);

for (;;) {
  await tick();
  await proxyPendingOutcalls();
  await sleep(POLL_MS);
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function isConflict(error) {
  return error instanceof Error && error.status === 409;
}

function isInstanceNotFound(error) {
  return (
    error instanceof Error &&
    error.status === 400 &&
    JSON.stringify(error.body ?? '').includes('Instance not found')
  );
}

function isRetryable(error) {
  return error instanceof Error && error.retryable === true;
}

async function mockOutcall(outcall, response) {
  try {
    await pocketIcFetch('/update/mock_canister_http', {
      body: JSON.stringify({
        additional_responses: [],
        request_id: outcall.request_id,
        response,
        subnet_id: outcall.subnet_id,
      }),
      method: 'POST',
    });
  } catch (error) {
    if (!isConflict(error)) {
      console.warn(`[https-outcall-proxy] mock failed: ${formatError(error)}`);
    }
  }
}

function parseJson(text) {
  if (!text) return null;
  return JSON.parse(text);
}

async function pocketIcFetch(path, init) {
  return poll(() => pocketIcFetchOnce(path, init), REQUEST_TIMEOUT_MS);
}

async function pocketIcFetchOnce(path, init) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });

  const text = await response.text();
  const body = parseJson(text);

  if (body && typeof body === 'object' && 'state_label' in body) {
    if (response.status === 202) {
      return await waitForOperation(body.state_label, body.op_id);
    }
    if (response.status === 409) {
      throw retryable('PocketIC is busy');
    }
  }

  if (!response.ok) {
    const error = new Error(`${response.status} ${response.statusText}${text ? `: ${text}` : ''}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return { body, text };
}

async function pocketIcJson(path) {
  return (await pocketIcFetch(path)).body;
}

async function poll(fn, timeoutMs) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error)) throw error;
      await sleep(RETRY_MS);
    }
  }
  throw lastError ?? new Error('PocketIC request timed out');
}

async function proxyOutcall(outcall) {
  const method = outcall.http_method;
  const url = outcall.url;
  const headers = new Headers();
  for (const header of outcall.headers ?? []) {
    headers.set(header.name, header.value);
  }

  try {
    const target = rewriteLocalUrl(url);
    console.log(
      target === url
        ? `[https-outcall-proxy] ${method} ${url}`
        : `[https-outcall-proxy] ${method} ${url} -> ${target}`,
    );
    const response = await fetch(target, {
      body: outcall.body ? Buffer.from(outcall.body, 'base64') : undefined,
      headers,
      method,
      signal: AbortSignal.timeout(10_000),
    });
    const responseHeaders = [];
    response.headers.forEach((value, name) => {
      responseHeaders.push({ name, value });
    });
    const body = Buffer.from(await response.arrayBuffer()).toString('base64');

    await mockOutcall(outcall, {
      CanisterHttpReply: {
        body,
        headers: responseHeaders,
        status: response.status,
      },
    });
  } catch (error) {
    const message = `HTTPS outcall proxy failed: ${formatError(error)}`;
    console.warn(`[https-outcall-proxy] ${url}: ${message}`);
    await mockOutcall(outcall, {
      CanisterHttpReject: {
        message,
        reject_code: 1,
      },
    });
  }
}

async function proxyPendingOutcalls() {
  for (;;) {
    let pending;
    try {
      pending = await pocketIcJson('/read/get_canister_http');
    } catch (error) {
      if (isInstanceNotFound(error)) {
        await refreshStatus();
        return;
      }
      if (!isConflict(error) && !isRetryable(error)) {
        console.warn(`[https-outcall-proxy] read pending failed: ${formatError(error)}`);
      }
      return;
    }

    if (pending.length === 0) return;

    for (const outcall of pending) {
      await proxyOutcall(outcall);
    }
    await tick();
  }
}

async function readStatus() {
  const value = JSON.parse(await readFile(STATUS_FILE, 'utf8'));
  const serverUrl = `http://${NETWORK_HOST}:${value.config_port}`;
  const baseUrl = `${serverUrl}/instances/${value.instance_id}`;
  return { ...value, baseUrl, serverUrl };
}

async function refreshStatus() {
  const next = await readStatus();
  if (next.baseUrl === baseUrl) return;

  status = next;
  serverUrl = next.serverUrl;
  baseUrl = next.baseUrl;
  console.log(`[https-outcall-proxy] switched to ${baseUrl}`);
}

function retryable(message) {
  const error = new Error(message);
  error.retryable = true;
  return error;
}

function rewriteLocalUrl(value) {
  const url = new URL(value);
  if (url.hostname === 'openid.localhost' || (url.hostname === 'localhost' && url.port === '11105')) {
    url.protocol = 'http:';
    url.hostname = 'openid-provider';
    url.port = '11105';
  }
  return url.toString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tick() {
  try {
    await pocketIcFetch('/update/tick', {
      body: '{}',
      method: 'POST',
    });
  } catch (error) {
    if (isInstanceNotFound(error)) {
      await refreshStatus();
      return;
    }
    if (!isConflict(error)) {
      console.warn(`[https-outcall-proxy] tick failed: ${formatError(error)}`);
    }
  }
}

async function waitForOperation(stateLabel, opId) {
  const graphPath = `/read_graph/${encodeURIComponent(stateLabel)}/${encodeURIComponent(opId)}`;
  return poll(async () => {
    const response = await fetch(`${serverUrl}${graphPath}`);
    const text = await response.text();
    const body = parseJson(text);

    if (!response.ok) {
      const error = retryable(`${response.status} ${response.statusText}${text ? `: ${text}` : ''}`);
      error.status = response.status;
      throw error;
    }
    if (body && typeof body === 'object' && ('state_label' in body || 'message' in body)) {
      throw retryable('PocketIC operation is still pending');
    }
    return { body, text };
  }, REQUEST_TIMEOUT_MS);
}
