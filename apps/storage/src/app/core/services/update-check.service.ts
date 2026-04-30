import { computed, inject, Injectable, resource, signal } from '@angular/core';
import { fromNullable } from '@dfinity/utils';
import { IcManagementCanister } from '@icp-sdk/canisters/ic-management';
import type { Principal } from '@icp-sdk/core/principal';
import {
  catchError,
  EMPTY,
  exhaustMap,
  first,
  firstValueFrom,
  from,
  map,
  tap,
  throwError,
  timeout,
  timer,
} from 'rxjs';

import {
  injectHttpAgent,
  injectMainActor,
  MAIN_CANISTER_ID_TOKEN,
  parseCanisterRejectError,
  convertStorageInfoList,
  getStorageCanisterId,
  type StorageInfo,
} from '@rabbithole/core';
import { AssetManager } from '@rabbithole/encrypted-storage';

import { ConfigService } from './config.service';

export type UpgradeStep = 'completed' | 'error' | 'idle' | 'preparing' | 'upgrading';
export type UpgradeProcessStep = 'permissions' | 'wasm' | 'frontend' | 'finalize';

type UpdateFlags = {
  frontendUpdateAvailable?: boolean;
  wasmUpdateAvailable?: boolean;
};

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 180_000; // 3 minutes

@Injectable({ providedIn: 'root' })
export class UpdateCheckService {
  readonly #actor = injectMainActor();
  readonly #configService = inject(ConfigService);
  readonly #updateResource = resource({
    params: () => ({
      actor: this.#actor(),
      canisterId: this.#configService.canisterId(),
    }),
    loader: async ({ params: { actor, canisterId } }) => {
      const result = await actor.checkStorageUpdate(canisterId);
      return fromNullable(result);
    },
  });
  readonly updateInfo = computed(() =>
    this.#updateResource.hasValue() ? this.#updateResource.value() : undefined,
  );

  readonly availableReleaseTag = computed(() => {
    const info = this.updateInfo();
    if (!info) return null;
    return fromNullable(info.availableReleaseTag) ?? null;
  });

  readonly currentReleaseTag = computed(() => {
    const info = this.updateInfo();
    if (!info) return null;
    return fromNullable(info.currentReleaseTag) ?? null;
  });

  readonly #errorMessage = signal<string | null>(null);

  readonly errorMessage = this.#errorMessage.asReadonly();

  readonly hasUpdate = computed(() => {
    const info = this.updateInfo();
    return !!info && (info.wasmUpdateAvailable || info.frontendUpdateAvailable);
  });

  readonly hasWasmUpdate = computed(() => !!this.updateInfo()?.wasmUpdateAvailable);

  readonly updateSummary = computed(() => {
    const info = this.updateInfo();
    if (!info) return '';
    if (info.wasmUpdateAvailable && info.frontendUpdateAvailable) return 'WASM + Frontend';
    if (info.wasmUpdateAvailable) return 'WASM';
    return 'Frontend';
  });

  // Upgrade state
  readonly #upgradeStep = signal<UpgradeStep>('idle');
  readonly upgradeStep = this.#upgradeStep.asReadonly();
  readonly #upgradeProcessStep = signal<UpgradeProcessStep>('permissions');
  readonly upgradeProcessStep = this.#upgradeProcessStep.asReadonly();

  readonly #backendCanisterId = inject(MAIN_CANISTER_ID_TOKEN);
  readonly #httpAgent = injectHttpAgent();

  reset(): void {
    this.#upgradeStep.set('idle');
    this.#upgradeProcessStep.set('permissions');
    this.#errorMessage.set(null);
  }

  async startUpgrade(): Promise<void> {
    const canisterId = this.#configService.canisterId();

    this.#upgradeStep.set('preparing');
    this.#upgradeProcessStep.set('permissions');
    this.#errorMessage.set(null);

    try {
      const agent = this.#httpAgent();
      const icManagement = IcManagementCanister.create({ agent });

      // Step 1: Add backend as controller (if not already)
      const status = await icManagement.canisterStatus({ canisterId });
      const controllers = status.settings.controllers.map((p: Principal) => p.toText());

      if (!controllers.includes(this.#backendCanisterId.toText())) {
        await icManagement.updateSettings({
          canisterId,
          settings: {
            controllers: [...controllers, this.#backendCanisterId.toText()],
          },
        });
      }

      // Step 2: Grant Commit permission to backend
      const assetManager = new AssetManager({ agent, canisterId });
      await assetManager.grantPermission('Commit', this.#backendCanisterId);

      // Step 3: Call upgradeStorage on backend
      this.#upgradeStep.set('upgrading');
      this.#upgradeProcessStep.set(firstUpdateStep(this.updateInfo()));
      const actor = this.#actor();
      const result = await actor.upgradeStorage(canisterId);

      if ('err' in result) {
        const errorKey = Object.keys(result.err)[0];
        throw new Error(errorKey);
      }

      // Step 4: Poll the actual storage record until the backend finishes.
      // checkStorageUpdate() returns null for non-Completed statuses, so it
      // cannot distinguish "done" from "currently upgrading".
      await this.#pollUntilComplete(canisterId);

      this.#upgradeStep.set('completed');

      // Reload after short delay to pick up new frontend
      setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
      console.error('Upgrade failed:', error);
      const errorMessage = parseCanisterRejectError(error) ?? (error instanceof Error ? error.message : 'An error has occurred');
      this.#errorMessage.set(errorMessage);
      this.#upgradeStep.set('error');
    }
  }

  #pollUntilComplete(canisterId: Principal): Promise<void> {
    const actor = this.#actor();

    return firstValueFrom(
      timer(POLL_INTERVAL_MS, POLL_INTERVAL_MS).pipe(
        exhaustMap(() =>
          from(actor.listStorages()).pipe(
            map((records) => findStorageByCanisterId(convertStorageInfoList(records), canisterId)),
            tap((storage) => {
              if (!storage) return;
              this.#upgradeProcessStep.set(
                upgradeProcessStepFromStatus(storage.status, this.updateInfo()),
              );
            }),
            catchError(() => EMPTY), // Backend may be temporarily unavailable during upgrade
          ),
        ),
        first((storage): storage is StorageInfo => {
          if (!storage) return false;
          return storage.status.type === 'Completed' || storage.status.type === 'Failed';
        }),
        map((storage) => {
          if (storage.status.type === 'Failed') {
            throw new Error(storage.status.message);
          }
          if (storage.updateAvailable) {
            throw new Error(
              storage.lastUpgradeError ??
                'Upgrade did not complete. Check your storage status in Rabbithole.',
            );
          }
        }),
        timeout({
          each: POLL_TIMEOUT_MS,
          with: () => throwError(() => new Error('Upgrade timed out. Check your storage status in Rabbithole.')),
        }),
      ),
    );
  }
}

function firstUpdateStep(
  updateInfo: UpdateFlags | undefined,
): UpgradeProcessStep {
  if (updateInfo?.wasmUpdateAvailable) return 'wasm';
  if (updateInfo?.frontendUpdateAvailable) return 'frontend';
  return 'finalize';
}

function upgradeProcessStepFromStatus(
  status: StorageInfo['status'],
  updateInfo: UpdateFlags | undefined,
): UpgradeProcessStep {
  switch (status.type) {
    case 'UpgradingWasm':
      return 'wasm';
    case 'UpgradingFrontend':
      return 'frontend';
    case 'RevokingInstallerPermission':
    case 'UpdatingControllers':
    case 'Completed':
      return 'finalize';
    default:
      return firstUpdateStep(updateInfo);
  }
}

function findStorageByCanisterId(
  storages: StorageInfo[],
  canisterId: Principal,
): StorageInfo | undefined {
  const expected = canisterId.toText();
  return storages.find(
    (storage) => getStorageCanisterId(storage)?.toText() === expected,
  );
}
