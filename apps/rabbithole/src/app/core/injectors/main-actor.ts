import { computed } from '@angular/core';
import { Actor } from '@dfinity/agent';
import { createInjectionToken } from 'ngxtension/create-injection-token';

import {
  ExtractInjectionToken,
  HTTP_AGENT_TOKEN,
  MAIN_CANISTER_ID,
  provideHttpAgent,
} from '@rabbithole/core';
import {
  RabbitholeActorService,
  rabbitholeIdlFactory,
} from '@rabbithole/declarations';

export const [injectMainActor, provideMainActor, MAIN_ACTOR_TOKEN] =
  createInjectionToken(
    (
      canisterId: ExtractInjectionToken<typeof MAIN_CANISTER_ID>,
      httpAgent: ExtractInjectionToken<typeof HTTP_AGENT_TOKEN>,
    ) =>
      computed(() =>
        Actor.createActor<RabbitholeActorService>(rabbitholeIdlFactory, {
          agent: httpAgent(),
          canisterId,
        }),
      ),
    {
      isRoot: false,
      deps: [MAIN_CANISTER_ID, HTTP_AGENT_TOKEN],
      extraProviders: [provideHttpAgent()],
    },
  );
