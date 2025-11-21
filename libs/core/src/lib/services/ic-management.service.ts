import { computed, inject, Injectable, resource, signal } from '@angular/core';
import { Principal } from '@dfinity/principal';
import {
  canister_status_result,
  CanisterSettings,
  ICManagementCanister,
} from '@icp-sdk/canisters/ic-management';
import { toast } from 'ngx-sonner';
import { Subject, switchMap } from 'rxjs';

import { injectHttpAgent } from '../injectors';
import { ENCRYPTED_STORAGE_CANISTER_ID } from '../tokens';
import { CanisterDataInfo } from '../types';
import { canisterStatus } from '../utils';
import { AUTH_SERVICE } from '@rabbithole/auth';

type State = {
  loading: {
    adding: string[];
    removing: string[];
  };
};

@Injectable()
export class ICManagementService {
  #authService = inject(AUTH_SERVICE);
  #canisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID);
  #httpAgent = injectHttpAgent();
  #icManagement = computed(() => {
    const agent = this.#httpAgent();
    return ICManagementCanister.create({ agent });
  });
  canisterStatus = resource<CanisterDataInfo, ICManagementCanister>({
    params: () => this.#icManagement(),
    loader: async ({ params: icManagement }) => {
      const pid = this.#authService.identity().getPrincipal();

      if (pid.isAnonymous()) {
        throw new Error('Anonymous user cannot access IC management');
      }

      const result = await icManagement.canisterStatus(this.#canisterId);

      return canisterStatus(result as canister_status_result);
    },
  });
  #state = signal<State>({
    loading: {
      adding: [],
      removing: [],
    },
  });
  state = this.#state.asReadonly();

  async addController(principal: Principal) {
    if (this.canisterStatus.hasValue()) {
      const controllers = this.canisterStatus
        .value()
        .settings.controllers.concat(principal)
        .map((p) => p.toText());
      const id = toast.loading('Adding controller...');
      this.#state.update((state) => ({
        ...state,
        loading: {
          ...state.loading,
          adding: [...state.loading.adding, principal.toText()],
        },
      }));

      try {
        await this.#icManagement().updateSettings({
          canisterId: this.#canisterId,
          settings: {
            controllers,
          },
        });
        toast.success('Controller added successfully', { id });
        this.canisterStatus.reload();
      } catch (error) {
        toast.error('Failed to add controller', { id });
        console.error(error);
      } finally {
        this.#state.update((state) => ({
          ...state,
          loading: {
            ...state.loading,
            adding: state.loading.adding.filter(
              (p) => p !== principal.toText(),
            ),
          },
        }));
      }
    }
  }

  async removeController(principal: Principal) {
    if (this.canisterStatus.hasValue()) {
      const controllers = this.canisterStatus
        .value()
        .settings.controllers.filter((p) => p.toText() !== principal.toText())
        .map((p) => p.toText());

      const id = toast.loading('Removing controller...');
      this.#state.update((state) => ({
        ...state,
        loading: {
          ...state.loading,
          removing: [...state.loading.removing, principal.toText()],
        },
      }));

      try {
        await this.#icManagement().updateSettings({
          canisterId: this.#canisterId,
          settings: {
            controllers,
          },
        });
        toast.success('Controller removed successfully', { id });
        this.canisterStatus.reload();
      } catch (error) {
        toast.error('Failed to remove controller', { id });
        console.error(error);
      } finally {
        this.#state.update((state) => ({
          ...state,
          loading: {
            ...state.loading,
            removing: state.loading.removing.filter(
              (p) => p !== principal.toText(),
            ),
          },
        }));
      }
    }
  }
}
