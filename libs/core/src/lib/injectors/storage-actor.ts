import { computed } from '@angular/core';
import { defaultAgent } from '@dfinity/utils';
import { createInjectionToken } from 'ngxtension/create-injection-token';

import { ASSETS_CANISTER_ID } from '../tokens';
import { ExtractInjectionToken } from '../types';
import { HTTP_AGENT_TOKEN, provideHttpAgent } from './http-agent';
import { getAssetsCanister } from '@rabbithole/assets';

export type StorageCanisterActor = ReturnType<typeof getAssetsCanister>;

export const [injectStorageActor, provideStorageActor, STORAGE_ACTOR_TOKEN] =
  createInjectionToken(
    (
      canisterId: ExtractInjectionToken<typeof ASSETS_CANISTER_ID>,
      httpAgent: ExtractInjectionToken<typeof HTTP_AGENT_TOKEN>
    ) =>
      computed(() => {
        const agent = httpAgent() ?? defaultAgent();
        return getAssetsCanister({
          agent,
          canisterId,
        });
      }),
    {
      isRoot: false,
      deps: [ASSETS_CANISTER_ID, HTTP_AGENT_TOKEN],
      extraProviders: [provideHttpAgent()],
    }
  );
// export const [injectStorageActor, provideStorageActor, STORAGE_ACTOR_TOKEN] =
//   createInjectionToken(
//     (
//       authService: ExtractInjectionToken<typeof AUTH_SERVICE>,
//       canisterId: ExtractInjectionToken<typeof ASSETS_CANISTER_ID>
//     ) => {
//       const identity$ = toObservable(authService.identity);
//       return toSignal(
//         authService.ready$.pipe(
//           filter((v) => v),
//           switchMap(() =>
//             identity$.pipe(
//               switchMap((identity) =>
//                 createAgent({
//                   identity,
//                   fetchRootKey: !environment.production,
//                   host: 'https://localhost',
//                 })
//               ),
//               map((agent) =>
//                 getAssetsCanister({
//                   agent,
//                   canisterId,
//                 })
//               )
//             )
//           )
//         ),
//         { initialValue: null }
//       );
//     },
//     {
//       isRoot: false,
//       deps: [AUTH_SERVICE, ASSETS_CANISTER_ID],
//     }
//   );

export function assertStorageActor(
  actor: StorageCanisterActor | null
): asserts actor is StorageCanisterActor {
  if (!actor)
    throw Error('The StorageCanisterActor instance is not initialized');
}
