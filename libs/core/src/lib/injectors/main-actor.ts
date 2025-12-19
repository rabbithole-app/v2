import { computed } from '@angular/core';
import { Actor } from '@icp-sdk/core/agent';
import { createInjectionToken } from 'ngxtension/create-injection-token';

import { MAIN_CANISTER_ID_TOKEN } from '../tokens';
import { ExtractInjectionToken } from '../types';
import { HTTP_AGENT_TOKEN, provideHttpAgent } from './http-agent';
import {
  RabbitholeActorService,
  rabbitholeIdlFactory,
} from '@rabbithole/declarations';

export const [injectMainActor, provideMainActor, MAIN_ACTOR_TOKEN] =
  createInjectionToken(
    (
      canisterId: ExtractInjectionToken<typeof MAIN_CANISTER_ID_TOKEN>,
      httpAgent: ExtractInjectionToken<typeof HTTP_AGENT_TOKEN>,
    ) =>
      computed(() =>
        Actor.createActor<RabbitholeActorService>(rabbitholeIdlFactory, {
          agent: httpAgent(),
          canisterId,
        }),
      ),
    {
      deps: [MAIN_CANISTER_ID_TOKEN, HTTP_AGENT_TOKEN],
      extraProviders: [provideHttpAgent()],
    },
  );
