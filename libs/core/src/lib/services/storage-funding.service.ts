import { computed, Injectable, resource } from '@angular/core';
import { Actor } from '@icp-sdk/core/agent';

import type { StorageFundingStatus } from '@rabbithole/declarations/backend';

import { injectMainActor } from '../injectors/main-actor';

@Injectable({ providedIn: 'root' })
export class StorageFundingService {
  #actor = injectMainActor();

  #statusResource = resource({
    params: () => this.#actor(),
    loader: async ({ params: actor }) => {
      const agent = Actor.agentOf(actor);
      const principal = await agent?.getPrincipal();
      if (principal?.isAnonymous()) return null;

      return await actor.getStorageFundingStatus();
    },
  });

  status = computed<StorageFundingStatus | null>(() => this.#statusResource.value() ?? null);

  includedProgress = computed(() => {
    const status = this.status();
    if (!status || status.includedCyclesLimit === 0n) return 0;
    return Number(status.includedCyclesUsed) / Number(status.includedCyclesLimit);
  });

  reload(): void {
    this.#statusResource.reload();
  }
}
