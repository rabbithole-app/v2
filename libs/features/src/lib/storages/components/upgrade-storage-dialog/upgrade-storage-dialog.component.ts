import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowUpCircle,
  lucideCheck,
  lucideCircleAlert,
} from '@ng-icons/lucide';
import {
  BrnDialogClose,
  injectBrnDialogContext,
} from '@spartan-ng/brain/dialog';
import { toast } from '@spartan-ng/brain/sonner';
import { rxEffect } from 'ngxtension/rx-effect';
import { filter } from 'rxjs';

import {
  buildUpgradeCopy,
  buildUpgradeSteps,
  getStorageCanisterId,
  injectStorageReleaseOptions,
  parseCanisterRejectError,
  type StorageInfo,
  type StorageReleaseOption,
  StoragesService,
  StorageUpgradeReviewComponent,
  type UpdateInfo,
  type UpgradeStepId,
} from '@rabbithole/core';
import {
  provideAssetManager,
  provideEncryptedStorageActor,
  provideStorageReleaseOptions,
} from '@rabbithole/core/storage-runtime';
import { ProcessStepListComponent } from '@rabbithole/ui/process-steps';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from '@spartan-ng/helm/dialog';
import { HlmIcon } from '@spartan-ng/helm/icon';

import { StorageUpgradeCoordinator } from './storage-upgrade-coordinator.service';

type ActiveUpgradePlan = {
  releaseTag: string;
  storageId: bigint;
  updateInfo: UpdateInfo;
};

type UpgradeLifecycleSnapshot = {
  currentUpgradeError: string | null;
  initialUpgradeError: string | null;
  sawUpgrading: boolean;
  selectedUpdateInfo: UpdateInfo;
  status: StorageInfo['status'] | null;
  step: WizardStep;
  stillHasUpdate: boolean;
};

type WizardStep = 'completed' | 'error' | 'review' | 'upgrading';

@Component({
  selector: 'rbth-feat-storages-upgrade-storage-dialog',
  imports: [
    NgIcon,
    HlmIcon,
    HlmDialogHeader,
    HlmDialogFooter,
    HlmDialogTitle,
    HlmDialogDescription,
    BrnDialogClose,
    ...HlmAlertImports,
    ...HlmButtonImports,
    ProcessStepListComponent,
    StorageUpgradeReviewComponent,
  ],
  providers: [
    StorageUpgradeCoordinator,
    provideAssetManager(),
    provideEncryptedStorageActor(),
    provideStorageReleaseOptions(),
    provideIcons({
      lucideArrowUpCircle,
      lucideCheck,
      lucideCircleAlert,
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
      this.#storagesService
        .storages()
        .find((storage) => storage.id === this.storage().id) ?? this.storage(),
  );
  readonly updateInfo = computed<UpdateInfo | undefined>(
    () =>
      this.currentStorage().updateAvailable ?? this.storage().updateAvailable,
  );
  readonly availableReleaseTag = computed(
    () => this.updateInfo()?.availableReleaseTag ?? 'unknown',
  );
  readonly canisterId = computed(
    () =>
      getStorageCanisterId(this.currentStorage()) ??
      getStorageCanisterId(this.storage()),
  );
  readonly #router = inject(Router);
  readonly canisterManagementHref = computed(() => {
    const canisterId = this.canisterId();
    if (!canisterId) return null;

    return this.#router.serializeUrl(
      this.#router.createUrlTree([
        '/dashboard',
        canisterId.toText(),
        'canister',
      ]),
    );
  });
  readonly #releaseOptionsResource = injectStorageReleaseOptions();
  readonly releaseOptions = computed<StorageReleaseOption[]>(() =>
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
  readonly selectedReleaseOption = computed(() => {
    const selectedTag = this.selectedReleaseTag();
    if (!selectedTag) return undefined;
    return this.releaseOptions().find(
      (option) => option.tagName === selectedTag,
    );
  });
  readonly selectedTargetUpdateInfo = computed(
    () => this.selectedReleaseOption()?.updateInfo,
  );
  readonly currentReleaseTag = computed(
    () =>
      this.selectedTargetUpdateInfo()?.currentReleaseTag ??
      this.updateInfo()?.currentReleaseTag ??
      this.currentStorage().releaseTag ??
      this.storage().releaseTag ??
      'unknown',
  );
  readonly currentReleaseTagValue = computed(
    () =>
      this.selectedTargetUpdateInfo()?.currentReleaseTag ??
      this.updateInfo()?.currentReleaseTag ??
      this.currentStorage().releaseTag ??
      this.storage().releaseTag ??
      null,
  );
  readonly #errorMessage = signal<string | null>(null);
  readonly errorMessage = this.#errorMessage.asReadonly();
  readonly #isPreparing = signal(false);
  readonly isPreparing = this.#isPreparing.asReadonly();
  readonly previousUpgradeError = computed(
    () => this.currentStorage().lastUpgradeError ?? null,
  );
  readonly releaseOptionsLoading = computed(() =>
    this.#releaseOptionsResource.isLoading(),
  );
  readonly #activePlan = signal<ActiveUpgradePlan | null>(null);
  readonly selectedUpdateInfo = computed<UpdateInfo>(
    () =>
      this.#activePlan()?.updateInfo ??
      this.selectedTargetUpdateInfo() ??
      this.updateInfo() ?? {
        frontendUpdateAvailable: false,
        wasmUpdateAvailable: false,
      },
  );
  readonly #step = signal<WizardStep>('review');
  readonly step = this.#step.asReadonly();
  readonly upgradeCopy = computed(() =>
    buildUpgradeCopy(this.selectedUpdateInfo()),
  );
  readonly #initialUpgradeError = signal<string | null>(null);
  readonly #rawUpgradeStatus = computed(() =>
    this.#storagesService.upgradeStatus(),
  );
  // Track whether we've seen an in-progress status from the backend.
  // This prevents false "upgrade failed" and UI flicker when the effect/template
  // fires before the first poll returns the new upgrading status.
  readonly #sawUpgrading = signal(false);
  // Filtered status that hides stale Completed before upgrade actually starts on backend
  readonly upgradeStatus = computed(() => {
    const status = this.#rawUpgradeStatus();
    if (!status) return null;
    if (status.type === 'Completed' && !this.#sawUpgrading()) {
      const currentUpgradeError =
        this.currentStorage().lastUpgradeError ?? null;
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
      frontendUpdateAvailable:
        this.selectedUpdateInfo().frontendUpdateAvailable,
      isPreparing: this.isPreparing(),
      wasmUpdateAvailable: this.selectedUpdateInfo().wasmUpdateAvailable,
    }),
  );
  readonly #upgradeCoordinator = inject(StorageUpgradeCoordinator);
  readonly #upgradeLifecycleSnapshot = computed<UpgradeLifecycleSnapshot>(
    () => ({
      currentUpgradeError: this.currentStorage().lastUpgradeError ?? null,
      initialUpgradeError: this.#initialUpgradeError(),
      sawUpgrading: this.#sawUpgrading(),
      selectedUpdateInfo: this.selectedUpdateInfo(),
      status: this.upgradeStatus(),
      step: this.step(),
      stillHasUpdate: !!this.currentStorage().updateAvailable,
    }),
    { equal: upgradeLifecycleSnapshotsEqual },
  );

  constructor() {
    rxEffect(
      toObservable(this.#upgradeLifecycleSnapshot).pipe(
        filter(({ step }) => step === 'upgrading'),
      ),
      (snapshot) => this.#handleUpgradeLifecycle(snapshot),
    );
  }

  finishUpgrade(): void {
    this.#storagesService.clearTrackedUpgrade();
    this.#activePlan.set(null);
  }

  selectRelease(releaseTag: string | null): void {
    this.#selectedReleaseTag.set(releaseTag);
  }

  async startUpgrade(): Promise<void> {
    const storage = this.storage();
    const canisterId = this.canisterId();
    if (!canisterId) return;
    const selectedRelease = this.selectedReleaseOption();

    if (!selectedRelease?.updateInfo || selectedRelease.disabled) {
      this.#errorMessage.set(
        selectedRelease?.disabledReason ?? 'Select an available release.',
      );
      this.#step.set('error');
      return;
    }

    this.#initialUpgradeError.set(
      this.currentStorage().lastUpgradeError ?? null,
    );
    const activePlan: ActiveUpgradePlan = {
      releaseTag: selectedRelease.tagName,
      storageId: storage.id,
      updateInfo: selectedRelease.updateInfo,
    };

    this.#activePlan.set(activePlan);
    this.#sawUpgrading.set(false);
    this.#step.set('upgrading');
    this.#isPreparing.set(true);
    this.#activeUpgradeStep.set('permissions');
    this.#errorMessage.set(null);

    try {
      await this.#upgradeCoordinator.startUpgrade(activePlan, {
        prepared: () => {
          this.#isPreparing.set(false);
          this.#activeUpgradeStep.set(firstUpdateStep(activePlan.updateInfo));
        },
      });
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
    this.#activePlan.set(null);
    this.#activeUpgradeStep.set('permissions');
    this.#sawUpgrading.set(false);
  }

  #handleUpgradeLifecycle(snapshot: UpgradeLifecycleSnapshot): void {
    const {
      currentUpgradeError,
      initialUpgradeError,
      sawUpgrading,
      selectedUpdateInfo,
      status,
      stillHasUpdate,
    } = snapshot;
    const isNewUpgradeError =
      currentUpgradeError &&
      (currentUpgradeError !== initialUpgradeError || sawUpgrading);

    if (isNewUpgradeError) {
      this.#showUpgradeError(currentUpgradeError);
      return;
    }

    if (!status) return;

    if (status.type === 'Completed') {
      if (stillHasUpdate) {
        this.#showUpgradeError(
          currentUpgradeError ??
            'Upgrade failed. The storage has been restored to its previous state.',
        );
        return;
      }

      this.#step.set('completed');
      toast.success('Storage upgraded successfully!');
      return;
    }

    if (status.type === 'Failed') {
      this.#showUpgradeError(status.message, `Upgrade failed: ${status.message}`);
      return;
    }

    this.#sawUpgrading.set(true);
    this.#activeUpgradeStep.set(
      upgradeStepIdFromStatus(status, selectedUpdateInfo),
    );
  }

  #showUpgradeError(message: string, toastMessage = 'Upgrade failed'): void {
    this.#errorMessage.set(message);
    this.#step.set('error');
    this.#isPreparing.set(false);
    toast.error(toastMessage);
  }
}

function firstUpdateStep(updateInfo: UpdateInfo): UpgradeStepId {
  if (updateInfo.wasmUpdateAvailable) return 'wasm';
  if (updateInfo.frontendUpdateAvailable) return 'frontend';
  return 'finalize';
}

function upgradeLifecycleSnapshotsEqual(
  a: UpgradeLifecycleSnapshot,
  b: UpgradeLifecycleSnapshot,
): boolean {
  return (
    a.currentUpgradeError === b.currentUpgradeError &&
    a.initialUpgradeError === b.initialUpgradeError &&
    a.sawUpgrading === b.sawUpgrading &&
    a.selectedUpdateInfo.frontendUpdateAvailable ===
      b.selectedUpdateInfo.frontendUpdateAvailable &&
    a.selectedUpdateInfo.wasmUpdateAvailable ===
      b.selectedUpdateInfo.wasmUpdateAvailable &&
    a.status?.type === b.status?.type &&
    upgradeStatusMessage(a.status) === upgradeStatusMessage(b.status) &&
    a.step === b.step &&
    a.stillHasUpdate === b.stillHasUpdate
  );
}

function upgradeStatusMessage(status: StorageInfo['status'] | null): string {
  return status?.type === 'Failed' ? status.message : '';
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
