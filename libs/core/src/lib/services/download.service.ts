import { computed, DestroyRef, inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { toast } from '@spartan-ng/brain/sonner';
import { SignalMap } from 'ngxtension/collections';
import { timer } from 'rxjs';

import { messageByAction } from '../operators';
import { ArchiveDownloadProgress, ArchiveDownloadRequest, CoreWorkerMessageIn, CoreWorkerMessageOut, DownloadProgress, DownloadRequest } from '../types';
import { WorkerService } from './worker.service';

export interface DownloadState {
  contentType?: string;
  entryPath: string;
  fileName: string;
  fileSize?: number;
  id: string;
  /** Hidden iframe that keeps the SW fetch alive. Created with port. */
  iframe?: HTMLIFrameElement;
  /** Created lazily when the first chunk arrives. */
  port?: MessagePort;
  progress: ArchiveDownloadProgress | DownloadProgress;
  totalChunks: number;
}

type WorkerLike = Pick<WorkerService<CoreWorkerMessageIn, CoreWorkerMessageOut>, 'postMessage' | 'workerMessage$'>;

@Injectable({ providedIn: 'root' })
export class DownloadService {
  readonly #downloads = new SignalMap<string, DownloadState>();
  activeDownloads = computed(() => {
    let count = 0;
    for (const [, state] of this.#downloads) {
      if (
        state.progress.status === 'downloading' ||
        state.progress.status === 'decrypting' ||
        state.progress.status === 'queued'
      ) {
        count++;
      }
    }
    return count;
  });
  readonly #archiveProgressCallbacks = new Map<string, (progress: ArchiveDownloadProgress) => void>();
  readonly #destroyRef = inject(DestroyRef);
  readonly #entryPathIndex = new Map<string, string>();
  /** Prevents double stream init when multiple chunks arrive before the first init completes. */
  readonly #streamInitPromises = new Map<string, Promise<{ iframe: HTMLIFrameElement; port: MessagePort }>>();

  #swReady: Promise<ServiceWorkerRegistration> | null = null;
  #workerService: WorkerLike | null = null;

  cancelDownload(id: string) {
    this.#workerService?.postMessage({
      action: 'download:cancel',
      payload: { id },
    });
    const state = this.#downloads.get(id);
    if (state) {
      state.port?.postMessage('abort');
      state.iframe?.remove();
      this.#entryPathIndex.delete(state.entryPath);
    }
    this.#streamInitPromises.delete(id);
    this.#downloads.delete(id);
  }

  connectWorker(workerService: WorkerLike) {
    if (this.#workerService) return;
    this.#workerService = workerService;

    workerService.workerMessage$
      .pipe(
        messageByAction('download:progress'),
        takeUntilDestroyed(this.#destroyRef),
      )
      .subscribe(({ payload }: { payload: DownloadProgress }) => {
        const current = this.#downloads.get(payload.id);
        if (!current) return;

        this.#downloads.set(payload.id, {
          ...current,
          progress: payload,
        });

        if (payload.status === 'completed') {
          this.#finalizeDownload(payload.id);
        }

        if (payload.status === 'failed') {
          this.#handleFailed(payload.id, current.fileName, payload.errorMessage);
        }
      });

    workerService.workerMessage$
      .pipe(
        messageByAction('download:chunk'),
        takeUntilDestroyed(this.#destroyRef),
      )
      .subscribe(
        ({
          payload,
        }: {
          payload: {
            chunk: ArrayBuffer;
            chunkIndex: number;
            contentType: string;
            fileName: string;
            id: string;
            totalChunks: number;
          };
        }) => {
          this.#handleChunk(payload);
        },
      );

    workerService.workerMessage$
      .pipe(
        messageByAction('download:archive-progress'),
        takeUntilDestroyed(this.#destroyRef),
      )
      .subscribe(({ payload }: { payload: ArchiveDownloadProgress }) => {
        const current = this.#downloads.get(payload.id);
        if (!current) return;

        this.#downloads.set(payload.id, {
          ...current,
          progress: payload,
        });

        this.#archiveProgressCallbacks.get(payload.id)?.(payload);

        if (payload.status === 'completed' || payload.status === 'failed' || payload.status === 'canceled') {
          this.#archiveProgressCallbacks.delete(payload.id);
        }

        if (payload.status === 'completed') {
          this.#finalizeDownload(payload.id);
        }

        if (payload.status === 'failed') {
          this.#handleFailed(payload.id, current.fileName, payload.errorMessage);
        }
      });

    workerService.workerMessage$
      .pipe(
        messageByAction('download:archive-chunk'),
        takeUntilDestroyed(this.#destroyRef),
      )
      .subscribe(({ payload }: { payload: { chunk: ArrayBuffer; id: string; } }) => {
        this.#handleArchiveChunk(payload);
      });
  }

  getDownloadByEntryPath(entryPath: string): DownloadState | undefined {
    for (const [, state] of this.#downloads) {
      if (state.entryPath === entryPath) return state;
    }
    return undefined;
  }

  getDownloadState(id: string) {
    return this.#downloads.get(id);
  }

  async startArchiveDownload(
    request: ArchiveDownloadRequest,
    workerService: WorkerLike,
    onProgress?: (progress: ArchiveDownloadProgress) => void,
  ) {
    this.connectWorker(workerService);
    await this.#ensureServiceWorker();

    if (onProgress) {
      this.#archiveProgressCallbacks.set(request.id, onProgress);
    }

    this.#downloads.set(request.id, {
      id: request.id,
      entryPath: `archive:${request.id}`,
      fileName: request.archiveName,
      contentType: 'application/zip',
      progress: { id: request.id, status: 'queued' },
      totalChunks: 0,
    });

    workerService.postMessage({
      action: 'download:archive',
      payload: request,
    });
  }

  async startDownload(request: DownloadRequest, workerService: WorkerLike, fileSize?: number) {
    this.connectWorker(workerService);

    // Pre-register SW so it's ready when the first chunk arrives
    await this.#ensureServiceWorker();

    const entryPath = request.entry[1];
    this.#entryPathIndex.set(entryPath, request.id);

    this.#downloads.set(request.id, {
      id: request.id,
      entryPath,
      fileName: request.fileName,
      contentType: request.contentType,
      fileSize,
      progress: { id: request.id, status: 'queued' },
      totalChunks: request.totalChunks,
    });

    workerService.postMessage({
      action: 'download:start',
      payload: request,
    });
  }

  #cleanup(id: string, delay: number) {
    timer(delay)
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe(() => {
        const state = this.#downloads.get(id);
        if (state) {
          this.#entryPathIndex.delete(state.entryPath);
          state.iframe?.remove();
        }
        this.#streamInitPromises.delete(id);
        this.#downloads.delete(id);
      });
  }

  async #ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
    if (!this.#swReady) {
      this.#swReady = this.#registerServiceWorker();
    }
    return this.#swReady;
  }

  /**
   * Create the browser-visible download stream lazily.
   * Deduplicates: concurrent calls for the same id share one promise.
   */
  async #ensureStream(id: string): Promise<{ iframe: HTMLIFrameElement; port: MessagePort }> {
    let promise = this.#streamInitPromises.get(id);
    if (promise) return promise;

    const state = this.#downloads.get(id);
    if (!state) throw new Error(`No download state for ${id}`);

    promise = this.#initStreamDownload(id, state.fileName, state.contentType, state.fileSize);
    this.#streamInitPromises.set(id, promise);

    const result = await promise;
    this.#streamInitPromises.delete(id);

    // Attach port & iframe to state
    const current = this.#downloads.get(id);
    if (current && !current.port) {
      this.#downloads.set(id, { ...current, port: result.port, iframe: result.iframe });

      // Listen for browser-side cancellation (user cancelled in download manager)
      result.port.onmessage = ({ data }) => {
        if (data === 'cancel') {
          this.cancelDownload(id);
        }
      };
    }

    return result;
  }

  #finalizeDownload(id: string) {
    const state = this.#downloads.get(id);
    if (!state) return;
    if (!state.port) {
      // Stream not created yet — #handleChunk will finalize after sending its chunk.
      // For empty files (no chunks at all), just clean up.
      if (state.totalChunks === 0) {
        this.#cleanup(id, 3000);
      }
      return;
    }
    state.port.postMessage('end');
    this.#cleanup(id, 3000);
  }

  async #handleArchiveChunk(payload: { chunk: ArrayBuffer; id: string; }) {
    const current = this.#downloads.get(payload.id);
    if (!current) return;
    if (current.progress.status === 'failed') return;

    if (!current.port) {
      try {
        await this.#ensureStream(payload.id);
      } catch {
        return;
      }
    }

    const state = this.#downloads.get(payload.id);
    if (!state?.port) return;
    if (state.progress.status === 'failed') return;

    state.port.postMessage(payload.chunk, [payload.chunk]);

    if (state.progress.status === 'completed') {
      state.port.postMessage('end');
      this.#cleanup(payload.id, 3000);
    }
  }

  async #handleChunk(payload: {
    chunk: ArrayBuffer;
    chunkIndex: number;
    contentType: string;
    fileName: string;
    id: string;
    totalChunks: number;
  }) {
    const current = this.#downloads.get(payload.id);
    if (!current) return;

    // Skip if download already reached terminal state before stream was created
    if (current.progress.status === 'failed') return;

    // Lazily create the browser download on the first chunk
    if (!current.port) {
      try {
        await this.#ensureStream(payload.id);
      } catch {
        return;
      }
    }

    // Re-read state after async — might have been cancelled/failed during init
    const state = this.#downloads.get(payload.id);
    if (!state?.port) return;
    if (state.progress.status === 'failed') return;

    state.port.postMessage(payload.chunk, [payload.chunk]);

    // If completed arrived while we were creating the stream, finalize now
    if (state.progress.status === 'completed') {
      state.port.postMessage('end');
      this.#cleanup(payload.id, 3000);
    }
  }

  #handleFailed(id: string, fileName: string, errorMessage: string) {
    console.error(`Download failed [${fileName}]:`, errorMessage);
    toast.error(`Download failed: ${fileName}`, { description: errorMessage });

    const state = this.#downloads.get(id);
    if (state?.port) {
      state.port.postMessage('abort');
    }
    this.#cleanup(id, 5000);
  }

  async #initStreamDownload(
    downloadId: string,
    fileName: string,
    contentType?: string,
    fileSize?: number,
  ): Promise<{ iframe: HTMLIFrameElement; port: MessagePort }> {
    await this.#ensureServiceWorker();
    const url = `/sw-download/${downloadId}/${encodeURIComponent(fileName)}`;

    const encodedName = encodeURIComponent(fileName);
    const headers: Record<string, string> = {
      'Content-Type': contentType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`,
    };
    if (fileSize != null && fileSize > 0) {
      headers['Content-Length'] = String(fileSize);
    }

    // MessageChannel: port1 stays in main thread, port2 goes to SW
    const channel = new MessageChannel();

    navigator.serviceWorker.controller!.postMessage(
      {
        type: 'download-init',
        url,
        headers,
        port: channel.port2,
      },
      [channel.port2],
    );

    // Trigger the download — iframe stays alive until download completes
    const iframe = document.createElement('iframe');
    iframe.hidden = true;
    iframe.src = url;
    document.body.appendChild(iframe);

    return { port: channel.port1, iframe };
  }

  async #registerServiceWorker(): Promise<ServiceWorkerRegistration> {
    const reg = await navigator.serviceWorker.register('/download-sw.js');

    // Wait for the SW to be active
    if (!reg.active) {
      await new Promise<void>((resolve) => {
        const sw = reg.installing ?? reg.waiting;
        if (!sw) { resolve(); return; }
        sw.addEventListener('statechange', function handler() {
          if (sw.state === 'activated') {
            sw.removeEventListener('statechange', handler);
            resolve();
          }
        });
      });
    }

    // If SW is not yet controlling this page, explicitly claim.
    // Note: claim is NOT in SW's activate handler to avoid disrupting webpack chunk loading.
    if (!navigator.serviceWorker.controller) {
      reg.active!.postMessage({ type: 'claim' });
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
      });
    }

    return reg;
  }
}
