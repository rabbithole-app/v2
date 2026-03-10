/// <reference lib="webworker" />

/**
 * Minimal Service Worker for streaming downloads.
 *
 * Flow:
 *  1. Main thread sends { type:'download-init', url, headers, port } (MessageChannel port2)
 *  2. Main thread creates a hidden iframe pointing at `url`
 *  3. SW intercepts the fetch, builds a ReadableStream from port messages, responds
 *  4. Browser download manager picks up the response as a normal file download
 *
 * Auto-updates: skipWaiting() ensures new versions activate immediately.
 * No manual unregister is ever needed.
 */

/** @type {Map<string, { headers?: Record<string,string>, port?: MessagePort, resolve?: (v: any) => void }>} */
const pending = new Map();

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('message', (event) => {
  const { type, url, headers, port } = event.data;

  if (type === 'claim') {
    event.waitUntil(self.clients.claim());
    return;
  }

  if (type === 'download-init') {
    const entry = pending.get(url);
    if (entry && entry.resolve) {
      // Fetch arrived first — resolve the waiting promise
      entry.resolve({ headers, port });
      pending.delete(url);
    } else {
      // Store data for when fetch arrives
      pending.set(url, { headers, port });
    }
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith('/sw-download/')) return;

  const entry = pending.get(url.pathname);

  if (entry && entry.port) {
    // Message arrived first — respond immediately
    pending.delete(url.pathname);
    event.respondWith(buildResponse(entry.headers, entry.port));
  } else {
    // Fetch arrived before message — wait
    event.respondWith(
      new Promise((resolve) => {
        pending.set(url.pathname, {
          resolve: ({ headers, port }) => resolve(buildResponse(headers, port)),
        });
      }),
    );
  }
});

/**
 * @param {Record<string, string>} headers
 * @param {MessagePort} port
 * @returns {Response}
 */
function buildResponse(headers, port) {
  const body = new ReadableStream({
    start(controller) {
      port.onmessage = ({ data }) => {
        if (data === 'end') {
          controller.close();
          port.close();
        } else if (data === 'abort') {
          controller.error(new Error('Download aborted'));
          port.close();
        } else if (data instanceof ArrayBuffer) {
          controller.enqueue(new Uint8Array(data));
        }
      };
    },
    cancel() {
      // Browser cancelled download (user pressed X in download manager)
      port.postMessage('cancel');
      port.close();
    },
  });

  return new Response(body, { headers: new Headers(headers) });
}
