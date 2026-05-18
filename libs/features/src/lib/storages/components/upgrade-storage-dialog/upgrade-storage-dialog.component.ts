import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { IcManagementCanister } from '@icp-sdk/canisters/ic-management';
import { Principal } from '@icp-sdk/core/principal';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowUpCircle,
  lucideCheck,
  lucideCircleAlert,
  lucideGlobe,
  lucidePackage,
} from '@ng-icons/lucide';
import { BrnDialogClose, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { toast } from 'ngx-sonner';

import {
  injectHttpAgent,
  MAIN_CANISTER_ID_TOKEN,
  parseCanisterRejectError,
} from '@rabbithole/core';
import {
  type StorageInfo,
  StoragesService,
  type UpdateInfo,
} from '@rabbithole/core';
import {
  buildUpgradeCopy,
  buildUpgradeSteps,
  type UpgradeStepId,
} from '@rabbithole/core';
import { AssetManager } from '@rabbithole/encrypted-storage';
import { ProcessStepListComponent } from '@rabbithole/ui/process-steps';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from '@spartan-ng/helm/dialog';
import { HlmIcon } from '@spartan-ng/helm/icon';

type WizardStep = 'completed' | 'error' | 'review' | 'upgrading';

@Component({
  selector: 'rbth-feat-storages-upgrade-storage-dialog',
  imports: [
    NgIcon,
    HlmIcon,
    HlmBadge,
    HlmDialogHeader,
    HlmDialogFooter,
    HlmDialogTitle,
    HlmDialogDescription,
    BrnDialogClose,
    ...HlmAlertImports,
    ...HlmButtonImports,
    ProcessStepListComponent,
  ],
  providers: [
    provideIcons({
      lucideArrowUpCircle,
      lucideCheck,
      lucideCircleAlert,
      lucideGlobe,
      lucidePackage,
    }),
  ],
  templateUrl: './upgrade-storage-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpgradeStorageDialogComponent {
  readonly #context = injectBrnDialogContext<{ storage: StorageInfo }>();
  readonly storage = computed(() => this.#context.storage);
  readonly #storagesService = inject(StoragesService);
  readonly currentStorage = computed(
    () =>
      this.#storagesService.storages().find((storage) => storage.id === this.storage().id) ??
      this.storage(),
  );
  readonly updateInfo = computed<UpdateInfo>(() => {
    const info = this.currentStorage().updateAvailable ?? this.storage().updateAvailable;
    if (!info) {
      throw new Error('updateAvailable must be defined when opening upgrade dialog');
    }
    return info;
  });
  readonly availableReleaseTag = computed(
    () => this.updateInfo().availableReleaseTag ?? 'unknown',
  );
  readonly currentReleaseTag = computed(
    () => this.updateInfo().currentReleaseTag ?? 'unknown',
  );
  readonly #errorMessage = signal<string | null>(null);
  readonly errorMessage = this.#errorMessage.asReadonly();
  readonly #isPreparing = signal(false);
  readonly isPreparing = this.#isPreparing.asReadonly();
  readonly previousUpgradeError = computed(
    () => this.currentStorage().lastUpgradeError ?? null,
  );
  readonly #step = signal<WizardStep>('review');
  readonly step = this.#step.asReadonly();
  readonly upgradeCopy = computed(() => buildUpgradeCopy(this.updateInfo()));
  readonly #initialUpgradeError = signal<string | null>(null);
  readonly #rawUpgradeStatus = computed(() => this.#storagesService.upgradeStatus());
  // Track whether we've seen an in-progress status from the backend.
  // This prevents false "upgrade failed" and UI flicker when the effect/template
  // fires before the first poll returns the new upgrading status.
  readonly #sawUpgrading = signal(false);
  // Filtered status that hides stale Completed before upgrade actually starts on backend
  readonly upgradeStatus = computed(() => {
    const status = this.#rawUpgradeStatus();
    if (!status) return null;
    if (status.type === 'Completed' && !this.#sawUpgrading()) {
      const currentUpgradeError = this.currentStorage().lastUpgradeError ?? null;
      const initialUpgradeError = this.#initialUpgradeError();
      if (!currentUpgradeError || currentUpgradeError === initialUpgradeError) {
        return null;
      }
    }
    return status;
  });
  readonly #activeUpgradeStep = signal<UpgradeStepId>('permissions');
  readonly upgradeSteps = computed(() =>
    buildUpgradeSteps(this.upgradeStatus(), {
      errorMessage: this.errorMessage(),
      failedStepId: this.#activeUpgradeStep(),
      frontendUpdateAvailable: this.updateInfo().frontendUpdateAvailable,
      isPreparing: this.isPreparing(),
      wasmUpdateAvailable: this.updateInfo().wasmUpdateAvailable,
    }),
  );
  readonly #backendCanisterId = inject(MAIN_CANISTER_ID_TOKEN);
  readonly #httpAgent = injectHttpAgent();

  constructor() {
    // Watch upgrade status for completion/failure
    effect(() => {
      const status = this.upgradeStatus();
      const currentStorage = this.currentStorage();
      const currentStep = untracked(() => this.step());

      if (currentStep !== 'upgrading') return;

      const currentUpgradeError = currentStorage.lastUpgradeError ?? null;
      const initialUpgradeError = untracked(() => this.#initialUpgradeError());
      const sawUpgrading = untracked(() => this.#sawUpgrading());
      const isNewUpgradeError =
        currentUpgradeError &&
        (currentUpgradeError !== initialUpgradeError || sawUpgrading);

      if (isNewUpgradeError) {
        untracked(() => {
          this.#errorMessage.set(currentUpgradeError);
          this.#step.set('error');
          this.#isPreparing.set(false);
        });
        toast.error('Upgrade failed');
        return;
      }

      if (!status) return;

      if (status.type === 'Completed') {
        // Check if upgrade actually succeeded by verifying updateAvailable is gone.
        // If it's still present, the upgrade was reverted due to an error.
        const stillHasUpdate = !!currentStorage.updateAvailable;

        if (stillHasUpdate) {
          untracked(() => {
            this.#errorMessage.set(
              currentStorage.lastUpgradeError ??
                'Upgrade failed. The storage has been restored to its previous state.',
            );
            this.#step.set('error');
            this.#isPreparing.set(false);
          });
          toast.error('Upgrade failed');
        } else {
          untracked(() => this.#step.set('completed'));
          toast.success('Storage upgraded successfully!');
        }
      } else if (status.type === 'Failed') {
        untracked(() => {
          this.#errorMessage.set(status.message);
          this.#step.set('error');
          this.#isPreparing.set(false);
        });
        toast.error(`Upgrade failed: ${status.message}`);
      } else {
        // Any in-progress status — mark that upgrade has started on backend
        untracked(() => {
          this.#sawUpgrading.set(true);
          this.#activeUpgradeStep.set(upgradeStepIdFromStatus(status, this.updateInfo()));
        });
      }
    });
  }

  finishUpgrade(): void {
    this.#storagesService.clearTrackedUpgrade();
  }

  async startUpgrade(): Promise<void> {
    const storage = this.storage();
    const canisterId = storage.canisterId;
    if (!canisterId) return;

    this.#initialUpgradeError.set(this.currentStorage().lastUpgradeError ?? null);
    this.#sawUpgrading.set(false);
    this.#step.set('upgrading');
    this.#isPreparing.set(true);
    this.#activeUpgradeStep.set('permissions');
    this.#errorMessage.set(null);

    try {
      const agent = this.#httpAgent();
      const icManagement = IcManagementCanister.create({ agent });

      // Step 1: Get current controllers and add backend
      const status = await icManagement.canisterStatus({ canisterId });
      const controllers = status.settings.controllers
        .map((p: Principal) => p.toText());

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

      this.#isPreparing.set(false);
      this.#activeUpgradeStep.set(firstUpdateStep(this.updateInfo()));

      // Step 3: Call upgradeStorage on backend (scope determined automatically)
      await this.#storagesService.upgradeStorage(storage.id, canisterId);
    } catch (error) {
      const errorMessage =
        parseCanisterRejectError(error) ?? 'An error has occurred';
      this.#errorMessage.set(errorMessage);
      this.#step.set('error');
      this.#isPreparing.set(false);
    }
  }

  tryAgain(): void {
    this.#step.set('review');
    this.#errorMessage.set(null);
    this.#initialUpgradeError.set(null);
    this.#activeUpgradeStep.set('permissions');
    this.#sawUpgrading.set(false);
  }
}

function firstUpdateStep(updateInfo: UpdateInfo): UpgradeStepId {
  if (updateInfo.wasmUpdateAvailable) return 'wasm';
  if (updateInfo.frontendUpdateAvailable) return 'frontend';
  return 'finalize';
}

function upgradeStepIdFromStatus(
  status: StorageInfo['status'],
  updateInfo: UpdateInfo,
): UpgradeStepId {
  switch (status.type) {
    case 'Completed':
    case 'RevokingInstallerPermission':
    case 'UpdatingControllers':
      return 'finalize';
    case 'UpgradingFrontend':
      return 'frontend';
    case 'UpgradingWasm':
      return 'wasm';
    default:
      return firstUpdateStep(updateInfo);
  }
}
