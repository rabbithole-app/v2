import { computed, Injectable, resource, signal } from '@angular/core';
import { Principal } from '@icp-sdk/core/principal';
import { toast } from 'ngx-sonner';

import { injectMainActor, parseCanisterRejectError } from '@rabbithole/core';

type CanistersServiceState = {
  deleting: string[];
  linking: boolean;
};

@Injectable({ providedIn: 'root' })
export class CanistersService {
  #actor = injectMainActor();
  readonly list = resource({
    params: () => this.#actor(),
    loader: async ({ params: actor }) => await actor.listCanisters(),
    defaultValue: [] as Principal[],
  });
  readonly canisters = computed(() => this.list.value());
  #state = signal<CanistersServiceState>({
    deleting: [],
    linking: false,
  });
  readonly isLinkingCanister = computed(() => this.#state().linking);
  readonly state = this.#state.asReadonly();

  async addCanister(canisterId: Principal): Promise<void> {
    if (this.#state().linking) {
      return;
    }

    this.#state.update((state) => ({ ...state, linking: true }));
    const id = toast.loading('Linking canister...');
    const actor = this.#actor();
    try {
      await actor.addCanister(canisterId);
      toast.success('Canister linked successfully', { id });
      this.list.reload();
    } catch (error) {
      const errorMessage =
        parseCanisterRejectError(error) ?? 'An error has occurred';
      toast.error(`Failed to link canister: ${errorMessage}`, { id });
      throw error;
    } finally {
      this.#state.update((state) => ({ ...state, linking: false }));
    }
  }

  async deleteCanister(canisterId: Principal): Promise<void> {
    const canisterIdText = canisterId.toText();
    if (this.#state().deleting.includes(canisterIdText)) {
      return;
    }

    this.#state.update((state) => ({
      ...state,
      deleting: [...state.deleting, canisterIdText],
    }));
    const id = toast.loading('Deleting canister...');
    const actor = this.#actor();
    try {
      await actor.deleteCanister(canisterId);
      toast.success('Canister deleted successfully', { id });
      this.list.reload();
    } catch (error) {
      const errorMessage =
        parseCanisterRejectError(error) ?? 'An error has occurred';
      toast.error(`Failed to delete canister: ${errorMessage}`, { id });
      throw error;
    } finally {
      this.#state.update((state) => ({
        ...state,
        deleting: state.deleting.filter((id) => id !== canisterIdText),
      }));
    }
  }

  isDeletingCanister = (canisterId: string) =>
    computed(() => this.#state().deleting.includes(canisterId));
}
