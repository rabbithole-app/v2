import { effect, inject, Provider } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { createInjectionToken } from 'ngxtension/create-injection-token';

import { assertWorker } from '../asserts';
import { messageByAction } from '../operators';
// Direct import to avoid circular dependency with services/index.ts
// which exports services that import from injectors
import { WorkerService } from '../services/worker.service';
import { WORKER } from '../tokens';
import {
  CoreWorkerMessageIn,
  CoreWorkerMessageOut,
  ExtractInjectionToken,
  NonNullableProps,
  WorkerConfigIn,
} from '../types';
import { HTTP_AGENT_OPTIONS_TOKEN } from './http-agent';
import { AUTH_SERVICE } from '@rabbithole/auth';

export const [injectCoreWorker, provideCoreWorker] = createInjectionToken(
  (
    authService: ExtractInjectionToken<typeof AUTH_SERVICE>,
    httpAgentOptions: ExtractInjectionToken<typeof HTTP_AGENT_OPTIONS_TOKEN>,
  ) => {
    const workerService = inject<
      WorkerService<CoreWorkerMessageIn, CoreWorkerMessageOut>
    >(WorkerService, { self: true });
    assertWorker(workerService.worker);
    effect(() => {
      if (authService.isAuthenticated()) {
        workerService.init();
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
        };
        workerService.postMessage({ action: 'worker:config', payload });
      });

    return workerService as NonNullableProps<typeof workerService, 'worker'>;
  },
  {
    isRoot: false,
    deps: [AUTH_SERVICE, HTTP_AGENT_OPTIONS_TOKEN],
    extraProviders: [
      {
        provide: WORKER,
        useFactory: () =>
          typeof Worker !== 'undefined'
            ? new Worker(new URL('../workers/core.worker', import.meta.url))
            : null,
      } satisfies Provider,
      WorkerService,
    ],
  },
);
