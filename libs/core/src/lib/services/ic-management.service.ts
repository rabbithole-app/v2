import { computed, inject, Injectable, resource } from '@angular/core';
import { ICManagementCanister } from '@icp-sdk/canisters/ic-management';

import { injectHttpAgent } from '../injectors';
import { ENCRYPTED_STORAGE_CANISTER_ID } from '../tokens';
import { parseCanisterStatus, ParsedCanisterStatus } from '../utils';
import { AUTH_SERVICE } from '@rabbithole/auth';

@Injectable()
export class ICManagementService {
  #authService = inject(AUTH_SERVICE);
  #canisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID);
  #httpAgent = injectHttpAgent();
  #icManagement = computed(() => {
    const agent = this.#httpAgent();
    return ICManagementCanister.create({ agent });
  });
  canisterStatus = resource<ParsedCanisterStatus, ICManagementCanister>({
    params: () => this.#icManagement(),
    loader: async ({ params: icManagement }) => {
      const pid = this.#authService.identity().getPrincipal();

      if (pid.isAnonymous()) {
        throw new Error('Anonymous user cannot access IC management');
      }

      const result = await icManagement.canisterStatus(this.#canisterId);

      return parseCanisterStatus(result);
    },
  });
}
