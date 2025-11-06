import { effect, inject, Provider } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Principal } from '@dfinity/principal';
import { createInjectionToken } from 'ngxtension/create-injection-token';

import { AUTH_SERVICE } from '@rabbithole/auth';
import {
  assertWorker,
  CoreWorkerMessageIn,
  CoreWorkerMessageOut,
  ENCRYPTED_STORAGE_CANISTER_ID,
  ExtractInjectionToken,
  HTTP_AGENT_OPTIONS_TOKEN,
  messageByAction,
  NonNullableProps,
  WORKER,
  WorkerConfigIn,
  WorkerService,
} from '@rabbithole/core';

export const [injectCoreWorker, provideCoreWorker] = createInjectionToken(
  (
    authService: ExtractInjectionToken<typeof AUTH_SERVICE>,
    assetCanisterId: Principal,
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
          canisters: { encryptedStorage: assetCanisterId.toText() },
        };
        workerService.postMessage({ action: 'worker:config', payload });
      });

    return workerService as NonNullableProps<typeof workerService, 'worker'>;
  },
  {
    isRoot: false,
    deps: [
      AUTH_SERVICE,
      ENCRYPTED_STORAGE_CANISTER_ID,
      HTTP_AGENT_OPTIONS_TOKEN,
    ],
    extraProviders: [
      {
        provide: WORKER,
        useFactory: () =>
          typeof Worker !== 'undefined'
            ? new Worker(
                new URL(
                  '../../../../../../libs/core/src/lib/workers/core.worker',
                  import.meta.url,
                ),
              )
            : null,
      } satisfies Provider,
      WorkerService,
    ],
  },
);
