import { computed, Injectable, resource } from '@angular/core';

import type {
  EncryptedStorage,
  StorageAccessRequest,
} from '@rabbithole/encrypted-storage';

import { injectEncryptedStorage } from '../injectors/encrypted-storage';

export type AccessRequestsCapability = {
  canManage: boolean;
  pendingCount: number;
};

@Injectable()
export class AccessRequestsCapabilityService {
  readonly #encryptedStorage = injectEncryptedStorage();

  readonly #capability = resource({
    params: () => this.#encryptedStorage(),
    loader: async ({ params: encryptedStorage }) =>
      this.#loadCapability(encryptedStorage),
  });

  readonly canManage = computed(
    () => this.#capability.value()?.canManage ?? false,
  );
  readonly loading = computed(() => this.#capability.isLoading());
  readonly pendingCount = computed(
    () => this.#capability.value()?.pendingCount ?? 0,
  );

  async check(): Promise<boolean> {
    return (await this.load()).canManage;
  }

  async load(): Promise<AccessRequestsCapability> {
    return this.#loadCapability(this.#encryptedStorage());
  }

  reload(): void {
    this.#capability.reload();
  }

  async #loadCapability(
    encryptedStorage: EncryptedStorage,
  ): Promise<AccessRequestsCapability> {
    try {
      const requests = await encryptedStorage.listAccessRequests();
      return {
        canManage: true,
        pendingCount: this.#pendingCount(requests),
      };
    } catch {
      return {
        canManage: false,
        pendingCount: 0,
      };
    }
  }

  #pendingCount(requests: StorageAccessRequest[]): number {
    return requests.filter((request) => 'pending' in request.status).length;
  }
}
