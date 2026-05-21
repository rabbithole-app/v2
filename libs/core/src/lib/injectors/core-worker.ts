import { effect, inject, Provider } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { createInjectionToken } from 'ngxtension/create-injection-token';

import { AUTH_SERVICE } from '@rabbithole/auth';

import { assertWorker } from '../asserts';
import { messageByAction } from '../operators';
// Direct import to avoid circular dependency with services/index.ts
// which exports services that import from injectors
import { UploadRegistryService } from '../services/upload-registry.service';
import { WorkerService } from '../services/worker.service';
import { BLOB_STORAGE_CONFIG_TOKEN, ENCRYPTED_STORAGE_BACKEND_TYPE_TOKEN } from '../tokens/main';
import { WORKER, WORKER_FACTORY } from '../tokens/worker';
import type { ExtractInjectionToken, NonNullableProps } from '../types/utility';
import type {
  CoreWorkerMessageIn,
  CoreWorkerMessageOut,
  WorkerConfigIn,
} from '../types/worker';
import { HTTP_AGENT_OPTIONS_TOKEN } from './http-agent';

export const [injectCoreWorker, provideCoreWorker] = createInjectionToken(
  (
    authService: ExtractInjectionToken<typeof AUTH_SERVICE>,
    httpAgentOptions: ExtractInjectionToken<typeof HTTP_AGENT_OPTIONS_TOKEN>,
  ) => {
    const workerService = inject<
      WorkerService<CoreWorkerMessageIn, CoreWorkerMessageOut>
    >(WorkerService, { self: true });
    const uploadRegistry = inject(UploadRegistryService);
    const blobStorageConfig = inject(BLOB_STORAGE_CONFIG_TOKEN, { optional: true });
    const storageBackend = inject(ENCRYPTED_STORAGE_BACKEND_TYPE_TOKEN, { optional: true });
    assertWorker(workerService.worker);
    effect(() => {
      if (authService.isAuthenticated()) {
        workerService.init();
        workerService.postMessage({
          action: 'worker:auth-sync',
        });
      } else {
        workerService.terminate();
      }
    });

    workerService.workerMessage$
      .pipe(messageByAction('worker:signOut'), takeUntilDestroyed())
      .subscribe(() => authService.signOut());

    workerService.workerMessage$
      .pipe(messageByAction('worker:init'), takeUntilDestroyed())
      .subscribe(() => {
        const payload: WorkerConfigIn = {
          httpAgentOptions,
          concurrentUploads: 3,
          concurrentDownloads: 2,
          concurrentThumbnailRewraps: 2,
          ...(blobStorageConfig ? { blobStorageGatewayUrl: blobStorageConfig.gatewayUrl } : {}),
          ...(storageBackend ? { storageBackend } : {}),
        };
        workerService.postMessage({ action: 'worker:config', payload });
      });

    // Route upload progress to global registry (survives navigation)
    workerService.workerMessage$
      .pipe(messageByAction('upload:progress-file'), takeUntilDestroyed())
      .subscribe(({ payload }) => {
        uploadRegistry.updateUpload(payload);
      });

    return workerService as NonNullableProps<typeof workerService, 'worker'>;
  },
  {
    isRoot: false,
    deps: [AUTH_SERVICE, HTTP_AGENT_OPTIONS_TOKEN],
    extraProviders: [
      {
        provide: WORKER_FACTORY,
        useFactory: () => () =>
          typeof Worker !== 'undefined'
            ? new Worker(
                new URL('../workers/core.worker', import.meta.url),
                { type: 'module' },
              )
            : null,
      } satisfies Provider,
      {
        provide: WORKER,
        useFactory: (createWorker: () => Worker | null) => createWorker(),
        deps: [WORKER_FACTORY],
      } satisfies Provider,
      WorkerService,
    ],
  },
);
