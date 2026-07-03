import type { PocketIc } from '@dfinity/pic';

/**
 * Test double for the canister's S3 HTTPS outcalls, built on PocketIC's raw
 * mock endpoints. Keys live in an in-memory object set: PUT stores, DELETE
 * removes, HEAD answers 200/404. `force` overrides the reply status for a
 * method without touching the object set (auth failures, sticky objects, ...).
 */

export type RawPendingHttpsOutcall = {
  subnet_id: { subnet_id: string };
  request_id: number;
  http_method: string;
  url: string;
  headers: { name: string; value: string }[];
  body: string;
  max_response_bytes?: number;
};

type RawPocketIcOperation = {
  state_label: string;
  op_id: string | number;
};

type PocketIcInternals = {
  client: {
    instancePath: string;
    serverClient: {
      baseUrl: string;
    };
  };
};

function pocketIcUrls(pic: PocketIc): { baseUrl: string; serverUrl: string } {
  const client = (pic as unknown as PocketIcInternals).client;
  return {
    baseUrl: `${client.serverClient.baseUrl}${client.instancePath}`,
    serverUrl: client.serverClient.baseUrl,
  };
}

function isRawOperation(value: unknown): value is RawPocketIcOperation {
  return (
    typeof value === 'object' &&
    value !== null &&
    'state_label' in value &&
    'op_id' in value
  );
}

async function readPocketIcJson(
  pic: PocketIc,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const { baseUrl, serverUrl } = pocketIcUrls(pic);
  const response = await fetch(`${baseUrl}${path}`, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (response.status === 202 && isRawOperation(body)) {
    return await waitForPocketIcOperation(serverUrl, body);
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}${text ? `: ${text}` : ''}`);
  }
  return body;
}

async function waitForPocketIcOperation(
  serverUrl: string,
  operation: RawPocketIcOperation,
): Promise<unknown> {
  const graphPath =
    `/read_graph/${encodeURIComponent(operation.state_label)}` +
    `/${encodeURIComponent(operation.op_id)}`;

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(`${serverUrl}${graphPath}`);
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;

    if (response.ok && !isRawOperation(body)) {
      return body;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('PocketIC operation did not finish');
}

export async function rawPendingHttpsOutcalls(
  pic: PocketIc,
): Promise<RawPendingHttpsOutcall[]> {
  return (await readPocketIcJson(
    pic,
    '/read/get_canister_http',
  )) as RawPendingHttpsOutcall[];
}

export async function mockHttpsOutcallReply(
  pic: PocketIc,
  outcall: RawPendingHttpsOutcall,
  status: number,
): Promise<void> {
  await readPocketIcJson(pic, '/update/mock_canister_http', {
    method: 'POST',
    body: JSON.stringify({
      additional_responses: [],
      request_id: outcall.request_id,
      response: {
        CanisterHttpReply: {
          body: '',
          headers: [],
          status,
        },
      },
      subnet_id: outcall.subnet_id,
    }),
  });
}

export class FakeS3 {
  readonly objects = new Set<string>();
  readonly served: RawPendingHttpsOutcall[] = [];
  force: Partial<Record<'PUT' | 'DELETE' | 'HEAD', number>> = {};

  constructor(private readonly pic: PocketIc) {}

  private async nextPending(): Promise<RawPendingHttpsOutcall> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const pending = await rawPendingHttpsOutcalls(this.pic);
      if (pending.length > 0) return pending[0];
      await this.pic.tick();
    }
    throw new Error('expected an HTTPS outcall, none was queued');
  }

  async serveNext(): Promise<RawPendingHttpsOutcall> {
    const outcall = await this.nextPending();
    const method = outcall.http_method as 'PUT' | 'DELETE' | 'HEAD';
    const key = new URL(outcall.url).pathname;
    const forced = this.force[method];

    let status: number;
    if (forced !== undefined) {
      status = forced;
    } else if (method === 'PUT') {
      this.objects.add(key);
      status = 200;
    } else if (method === 'DELETE') {
      this.objects.delete(key);
      status = 204;
    } else if (method === 'HEAD') {
      status = this.objects.has(key) ? 200 : 404;
    } else {
      status = 501;
    }

    await mockHttpsOutcallReply(this.pic, outcall, status);
    this.served.push(outcall);
    return outcall;
  }

  async serve(count: number): Promise<RawPendingHttpsOutcall[]> {
    const outcalls: RawPendingHttpsOutcall[] = [];
    for (let index = 0; index < count; index += 1) {
      outcalls.push(await this.serveNext());
    }
    return outcalls;
  }
}
