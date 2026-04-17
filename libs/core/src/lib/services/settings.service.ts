import { computed, Injectable, resource } from '@angular/core';
import { Actor } from '@icp-sdk/core/agent';
import { toast } from 'ngx-sonner';

import type { UserSettings } from '@rabbithole/declarations';

import { injectMainActor } from '../injectors';
import { parseCanisterRejectError } from '../utils';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  #actor = injectMainActor();

  #settingsResource = resource({
    params: () => this.#actor(),
    loader: async ({ params: actor }) => {
      const agent = Actor.agentOf(actor);
      const principal = await agent?.getPrincipal();
      if (principal?.isAnonymous()) return null;

      return await actor.getSettings();
    },
  });

  settings = computed<UserSettings | null>(() => this.#settingsResource.value() ?? null);
  autoRenew = computed(() => this.settings()?.autoRenew ?? false);
  autoTopUp = computed(() => this.settings()?.autoTopUp ?? false);
  spendingPriority = computed(() => this.settings()?.spendingPriority ?? []);

  reload(): void {
    this.#settingsResource.reload();
  }

  async updateSettings(settings: UserSettings): Promise<void> {
    const id = toast.loading('Updating settings...');
    const actor = this.#actor();

    try {
      await actor.updateSettings(settings);
      toast.success('Settings updated', { id });
      this.#settingsResource.reload();
    } catch (error) {
      const errorMessage = parseCanisterRejectError(error) ?? 'An error has occurred';
      toast.error(`Failed to update settings: ${errorMessage}`, { id });
      throw error;
    }
  }
}
