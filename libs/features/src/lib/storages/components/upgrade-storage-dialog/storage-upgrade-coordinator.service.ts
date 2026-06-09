import { inject, Injectable } from '@angular/core';
import { IcManagementCanister } from '@icp-sdk/canisters/ic-management';

import {
  ENCRYPTED_STORAGE_CANISTER_ID,
  injectHttpAgent,
  MAIN_CANISTER_ID_TOKEN,
  StoragesService,
} from '@rabbithole/core';
import {
  injectAssetManager,
  injectEncryptedStorageActor,
  type StorageReleaseState,
} from '@rabbithole/core/storage-runtime';

export type StorageUpgradeHooks = {
  prepared?: () => void;
};

export type StorageUpgradeRequest = {
  releaseTag: string;
  storageId: bigint;
};

type PreparationState = {
  addedBackendController: boolean;
  grantedCommitPermission: boolean;
};

@Injectable()
export class StorageUpgradeCoordinator {
  readonly #agent = injectHttpAgent();
  readonly #assetManager = injectAssetManager();
  readonly #backendCanisterId = inject(MAIN_CANISTER_ID_TOKEN);
  readonly #canisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID);
  readonly #storageActor = injectEncryptedStorageActor();
  readonly #storagesService = inject(StoragesService);

  async startUpgrade(
    request: StorageUpgradeRequest,
    hooks: StorageUpgradeHooks = {},
  ): Promise<void> {
    const state: PreparationState = {
      addedBackendController: false,
      grantedCommitPermission: false,
    };
    let backendAccepted = false;

    try {
      const observedState = await this.#prepare(state);
      hooks.prepared?.();

      await this.#storagesService.startStorageUpgrade(
        request.storageId,
        this.#canisterId,
        request.releaseTag,
        observedState,
      );
      backendAccepted = true;
    } catch (error) {
      if (!backendAccepted) {
        await this.#rollback(state);
      }

      throw error;
    }
  }

  async #prepare(state: PreparationState): Promise<StorageReleaseState> {
    const observedState = await this.#storageActor().getStorageReleaseState();
    const icManagement = IcManagementCanister.create({ agent: this.#agent() });
    const backendCanisterIdText = this.#backendCanisterId.toText();

    const status = await icManagement.canisterStatus({
      canisterId: this.#canisterId,
    });
    const controllers = status.settings.controllers.map((controller) =>
      controller.toText(),
    );

    if (!controllers.includes(backendCanisterIdText)) {
      await icManagement.updateSettings({
        canisterId: this.#canisterId,
        settings: {
          controllers: [...controllers, backendCanisterIdText],
        },
      });
      state.addedBackendController = true;
    }

    await this.#assetManager().grantPermission(
      'Commit',
      this.#backendCanisterId,
    );
    state.grantedCommitPermission = true;

    return observedState;
  }

  async #rollback(state: PreparationState): Promise<void> {
    if (state.grantedCommitPermission) {
      try {
        await this.#assetManager().revokePermission(
          'Commit',
          this.#backendCanisterId,
        );
      } catch (error) {
        console.warn(
          'Failed to revoke temporary storage commit permission',
          error,
        );
      }
    }

    if (state.addedBackendController) {
      try {
        const icManagement = IcManagementCanister.create({
          agent: this.#agent(),
        });
        const backendCanisterIdText = this.#backendCanisterId.toText();
        const status = await icManagement.canisterStatus({
          canisterId: this.#canisterId,
        });
        const controllers = status.settings.controllers
          .map((controller) => controller.toText())
          .filter((controller) => controller !== backendCanisterIdText);

        await icManagement.updateSettings({
          canisterId: this.#canisterId,
          settings: { controllers },
        });
      } catch (error) {
        console.warn('Failed to remove temporary backend controller', error);
      }
    }
  }
}
