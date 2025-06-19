import { effect, inject, Injectable, Provider } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Principal } from '@dfinity/principal';
import { CreateAgentParams } from '@dfinity/utils';
import { createInjectionToken } from 'ngxtension/create-injection-token';
import { filter } from 'rxjs';

import { AUTH_SERVICE } from '@rabbithole/auth';
import {
  assertWorker,
  ASSETS_CANISTER_ID,
  CoreWorkerMessageIn,
  CoreWorkerMessageOut,
  CREATE_AGENT_PARAMS_TOKEN,
  ExtractInjectionToken,
  messageByAction,
  NonNullableProps,
  WORKER,
  WorkerConfig,
  WorkerConfigIn,
  WorkerService,
} from '@rabbithole/core';

export const [injectCoreWorker, provideCoreWorker] = createInjectionToken(
  (
    authService: ExtractInjectionToken<typeof AUTH_SERVICE>,
    assetCanisterId: Principal,
    createAgentParams: ExtractInjectionToken<typeof CREATE_AGENT_PARAMS_TOKEN>,
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
          createAgentParams,
          canisters: { assets: assetCanisterId.toText() },
        };
        workerService.postMessage({ action: 'worker:config', payload });
      });

    console.log(workerService);

    return workerService as NonNullableProps<typeof workerService, 'worker'>;
  },
  {
    isRoot: false,
    deps: [AUTH_SERVICE, ASSETS_CANISTER_ID, CREATE_AGENT_PARAMS_TOKEN],
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
                { type: 'module' },
              )
            : null,
      } satisfies Provider,
      WorkerService,
    ],
  },
);
