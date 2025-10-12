import { computed } from '@angular/core';
import { createInjectionToken } from 'ngxtension/create-injection-token';

import { ENCRYPTED_STORAGE_CANISTER_ID } from '../tokens';
import { ExtractInjectionToken } from '../types';
import { HTTP_AGENT_TOKEN, provideHttpAgent } from './http-agent';
import { createEncryptedStorageActor } from '@rabbithole/encrypted-storage';

export type EncryptedStorageActor = ReturnType<
  typeof createEncryptedStorageActor
>;

export const [
  injectEncryptedStorageActor,
  provideEncryptedStorageActor,
  STORAGE_ACTOR_TOKEN,
] = createInjectionToken(
  (
    canisterId: ExtractInjectionToken<typeof ENCRYPTED_STORAGE_CANISTER_ID>,
    httpAgent: ExtractInjectionToken<typeof HTTP_AGENT_TOKEN>,
  ) =>
    computed(() =>
      createEncryptedStorageActor({
        agent: httpAgent(),
        canisterId,
      }),
    ),
  {
    isRoot: false,
    deps: [ENCRYPTED_STORAGE_CANISTER_ID, HTTP_AGENT_TOKEN],
    extraProviders: [provideHttpAgent()],
  },
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

export function assertEncryptedStorageActor(
  actor: EncryptedStorageActor | null,
): asserts actor is EncryptedStorageActor {
  if (!actor)
    throw Error('The EncryptedStorageActor instance is not initialized');
}
