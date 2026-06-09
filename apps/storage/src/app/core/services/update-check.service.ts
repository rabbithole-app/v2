import { computed, inject, Injectable, resource, signal } from "@angular/core";
import { fromNullable } from "@dfinity/utils";
import { IcManagementCanister } from "@icp-sdk/canisters/ic-management";
import type { Principal } from "@icp-sdk/core/principal";
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
} from "rxjs";

import {
  injectHttpAgent,
  injectMainActor,
  MAIN_CANISTER_ID_TOKEN,
  parseCanisterRejectError,
} from "@rabbithole/core/app-runtime";
import {
  convertStorageInfoList,
  formatUpgradeStorageError,
  getStorageCanisterId,
  hasBlockedStorageReleaseOption,
  injectStorageReleaseOptions,
  type StorageInfo,
  type UpdateInfo,
} from "@rabbithole/core/storage-runtime";
import {
  AssetManager,
  createEncryptedStorageActor,
} from "@rabbithole/encrypted-storage";

import { ConfigService } from "./config.service";

export type UpgradeProcessStep =
  | "finalize"
  | "frontend"
  | "permissions"
  | "wasm";
export type UpgradeStep =
  | "completed"
  | "error"
  | "idle"
  | "preparing"
  | "upgrading";

type UpdateFlags = {
  frontendUpdateAvailable?: boolean;
  wasmUpdateAvailable?: boolean;
};

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 180_000; // 3 minutes

@Injectable({ providedIn: "root" })
export class UpdateCheckService {
  readonly #releaseOptionsResource = injectStorageReleaseOptions();
  readonly releaseOptions = computed(() =>
    this.#releaseOptionsResource.hasValue()
      ? this.#releaseOptionsResource.value()
      : [],
  );
  readonly #selectedReleaseTag = signal<string | null>(null);
  readonly selectedReleaseTag = computed(() => {
    const selectedTag = this.#selectedReleaseTag();
    if (selectedTag) {
      const selected = this.releaseOptions().find(
        (option) => option.tagName === selectedTag && !option.disabled,
      );
      if (selected) return selected.tagName;
    }
    return (
      this.releaseOptions().find((option) => !option.disabled)?.tagName ?? null
    );
  });
  readonly availableReleaseTag = computed(() => {
    return this.selectedReleaseTag();
  });

  readonly blockedReleaseOptions = computed(() =>
    this.releaseOptions().filter(hasBlockedStorageReleaseOption),
  );

  readonly blockedReleaseOption = computed(
    () => this.blockedReleaseOptions()[0],
  );

  readonly selectedReleaseOption = computed(() => {
    const selectedTag = this.selectedReleaseTag();
    if (!selectedTag) return undefined;
    return this.releaseOptions().find(
      (option) => option.tagName === selectedTag,
    );
  });
  readonly #configService = inject(ConfigService);
  readonly #httpAgent = injectHttpAgent();
  readonly #storageReleaseTagResource = resource({
    params: () => ({
      agent: this.#httpAgent(),
      canisterId: this.#configService.canisterId(),
    }),
    loader: async ({ params: { agent, canisterId } }) => {
      const actor = createEncryptedStorageActor({ agent, canisterId });
      const state = await actor.getStorageReleaseState();
      return fromNullable(state.releaseTag) ?? null;
    },
  });
  readonly currentReleaseTag = computed(() => {
    const canisterReleaseTag = this.#storageReleaseTagResource.hasValue()
      ? this.#storageReleaseTagResource.value()
      : null;
    return (
      this.selectedReleaseOption()?.updateInfo?.currentReleaseTag ??
      canisterReleaseTag ??
      null
    );
  });
  readonly #errorMessage = signal<string | null>(null);
  readonly errorMessage = this.#errorMessage.asReadonly();
  readonly hasUpdate = computed(() => {
    const info = this.selectedReleaseOption()?.updateInfo;
    return !!info && (info.wasmUpdateAvailable || info.frontendUpdateAvailable);
  });
  readonly hasBlockedUpdate = computed(
    () => !this.hasUpdate() && this.blockedReleaseOptions().length > 0,
  );
  readonly hasWasmUpdate = computed(
    () => !!this.selectedReleaseOption()?.updateInfo?.wasmUpdateAvailable,
  );
  readonly releaseOptionsLoading = computed(() =>
    this.#releaseOptionsResource.isLoading(),
  );

  readonly #activeUpdateInfo = signal<UpdateInfo | undefined>(undefined);

  readonly selectedUpdateInfo = computed<UpdateInfo | undefined>(
    () => this.#activeUpdateInfo() ?? this.selectedReleaseOption()?.updateInfo,
  );

  readonly updateSummary = computed(() => {
    const info = this.selectedReleaseOption()?.updateInfo;
    if (!info) return "";
    if (info.wasmUpdateAvailable && info.frontendUpdateAvailable)
      return "WASM + Frontend";
    if (info.wasmUpdateAvailable) return "WASM";
    return "Frontend";
  });
  readonly #upgradeProcessStep = signal<UpgradeProcessStep>("permissions");

  readonly upgradeProcessStep = this.#upgradeProcessStep.asReadonly();

  // Upgrade state
  readonly #upgradeStep = signal<UpgradeStep>("idle");
  readonly upgradeStep = this.#upgradeStep.asReadonly();
  readonly #actor = injectMainActor();
  readonly #backendCanisterId = inject(MAIN_CANISTER_ID_TOKEN);

  reset(): void {
    this.#upgradeStep.set("idle");
    this.#upgradeProcessStep.set("permissions");
    this.#errorMessage.set(null);
    this.#activeUpdateInfo.set(undefined);
  }

  selectReleaseTag(releaseTag: string | null): void {
    this.#selectedReleaseTag.set(releaseTag);
  }

  async startUpgrade(): Promise<void> {
    const canisterId = this.#configService.canisterId();
    const selectedRelease = this.selectedReleaseOption();

    this.#upgradeStep.set("preparing");
    this.#upgradeProcessStep.set("permissions");
    this.#errorMessage.set(null);

    try {
      if (!selectedRelease?.updateInfo || selectedRelease.disabled) {
        throw new Error(
          selectedRelease?.disabledReason ?? "Select an available release.",
        );
      }

      const agent = this.#httpAgent();
      const storageActor = createEncryptedStorageActor({ agent, canisterId });
      const observedState = await storageActor.getStorageReleaseState();
      const icManagement = IcManagementCanister.create({ agent });

      // Step 1: Add backend as controller (if not already)
      const status = await icManagement.canisterStatus({ canisterId });
      const controllers = status.settings.controllers.map((p: Principal) =>
        p.toText(),
      );

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
      await assetManager.grantPermission("Commit", this.#backendCanisterId);

      // Step 3: Call upgradeStorage on backend
      this.#upgradeStep.set("upgrading");
      this.#activeUpdateInfo.set(selectedRelease.updateInfo);
      this.#upgradeProcessStep.set(firstUpdateStep(selectedRelease.updateInfo));
      const actor = this.#actor();
      const result = await actor.startStorageUpgrade(
        canisterId,
        selectedRelease.tagName,
        observedState,
      );

      if ("err" in result) {
        const errorKey = Object.keys(result.err)[0];
        throw new Error(formatUpgradeStorageError(errorKey));
      }

      // Step 4: Poll the actual storage record until the backend finishes.
      // listStorages() carries the creation status needed to distinguish
      // "done" from "currently upgrading".
      await this.#pollUntilComplete(canisterId);

      this.#upgradeStep.set("completed");

      // Reload after short delay to pick up new frontend
      setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
      console.error("Upgrade failed:", error);
      const errorMessage =
        parseCanisterRejectError(error) ??
        (error instanceof Error ? error.message : "An error has occurred");
      this.#errorMessage.set(errorMessage);
      this.#upgradeStep.set("error");
    }
  }

  #pollUntilComplete(canisterId: Principal): Promise<void> {
    const actor = this.#actor();

    return firstValueFrom(
      timer(POLL_INTERVAL_MS, POLL_INTERVAL_MS).pipe(
        exhaustMap(() =>
          from(actor.listStorages()).pipe(
            map((records) =>
              findStorageByCanisterId(
                convertStorageInfoList(records),
                canisterId,
              ),
            ),
            tap((storage) => {
              if (!storage) return;
              this.#upgradeProcessStep.set(
                upgradeProcessStepFromStatus(
                  storage.status,
                  this.#activeUpdateInfo() ?? this.selectedUpdateInfo(),
                ),
              );
            }),
            catchError(() => EMPTY), // Backend may be temporarily unavailable during upgrade
          ),
        ),
        first((storage): storage is StorageInfo => {
          if (!storage) return false;
          return (
            storage.status.type === "Completed" ||
            storage.status.type === "Failed"
          );
        }),
        map((storage) => {
          if (storage.status.type === "Failed") {
            throw new Error(storage.status.message);
          }
          if (storage.updateAvailable) {
            throw new Error(
              storage.lastUpgradeError ??
                "Upgrade did not complete. Check your storage status in Rabbithole.",
            );
          }
        }),
        timeout({
          each: POLL_TIMEOUT_MS,
          with: () =>
            throwError(
              () =>
                new Error(
                  "Upgrade timed out. Check your storage status in Rabbithole.",
                ),
            ),
        }),
      ),
    );
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

function firstUpdateStep(
  updateInfo: UpdateFlags | undefined,
): UpgradeProcessStep {
  if (updateInfo?.wasmUpdateAvailable) return "wasm";
  if (updateInfo?.frontendUpdateAvailable) return "frontend";
  return "finalize";
}

function upgradeProcessStepFromStatus(
  status: StorageInfo["status"],
  updateInfo: UpdateFlags | undefined,
): UpgradeProcessStep {
  switch (status.type) {
    case "Completed":
    case "RevokingInstallerPermission":
    case "UpdatingControllers":
      return "finalize";
    case "UpgradingFrontend":
      return "frontend";
    case "UpgradingWasm":
      return "wasm";
    default:
      return firstUpdateStep(updateInfo);
  }
}
