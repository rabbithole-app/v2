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
import { AssetManager } from '@rabbithole/encrypted-storage';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from '@spartan-ng/helm/dialog';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

import { StorageCreationProgressComponent } from '../storage-creation-progress/storage-creation-progress.component';

type WizardStep = 'completed' | 'error' | 'review' | 'upgrading';

@Component({
  selector: 'rbth-feat-storages-upgrade-storage-dialog',
  imports: [
    NgIcon,
    HlmIcon,
    HlmBadge,
    HlmSpinner,
    HlmDialogHeader,
    HlmDialogFooter,
    HlmDialogTitle,
    HlmDialogDescription,
    BrnDialogClose,
    ...HlmAlertImports,
    ...HlmButtonImports,
    ...HlmEmptyImports,
    StorageCreationProgressComponent,
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
  readonly updateInfo = computed<UpdateInfo>(() => {
    const info = this.storage().updateAvailable;
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
  readonly #step = signal<WizardStep>('review');
  readonly step = this.#step.asReadonly();
  readonly updateSummary = computed(() => {
    const info = this.updateInfo();
    if (info.wasmUpdateAvailable && info.frontendUpdateAvailable) return 'WASM + Frontend';
    if (info.wasmUpdateAvailable) return 'WASM';
    return 'Frontend';
  });
  readonly #storagesService = inject(StoragesService);
  readonly #rawUpgradeStatus = computed(() => this.#storagesService.upgradeStatus());
  // Track whether we've seen an in-progress status from the backend.
  // This prevents false "upgrade failed" and UI flicker when the effect/template
  // fires before the first poll returns the new upgrading status.
  readonly #sawUpgrading = signal(false);
  // Filtered status that hides stale Completed before upgrade actually starts on backend
  readonly upgradeStatus = computed(() => {
    const status = this.#rawUpgradeStatus();
    if (!status) return null;
    if (status.type === 'Completed' && !this.#sawUpgrading()) return null;
    return status;
  });
  readonly #backendCanisterId = inject(MAIN_CANISTER_ID_TOKEN);
  readonly #httpAgent = injectHttpAgent();

  constructor() {
    // Watch upgrade status for completion/failure
    effect(() => {
      const status = this.upgradeStatus();
      const currentStep = untracked(() => this.step());

      if (currentStep !== 'upgrading' || !status) return;

      if (status.type === 'Completed') {
        // Check if upgrade actually succeeded by verifying updateAvailable is gone.
        // If it's still present, the upgrade was reverted due to an error.
        const storages = this.#storagesService.storages();
        const current = storages.find((s) => s.id === this.storage().id);
        const stillHasUpdate = !!current?.updateAvailable;

        if (stillHasUpdate) {
          untracked(() => {
            this.#errorMessage.set('Upgrade failed. The storage has been restored to its previous state.');
            this.#step.set('error');
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
        });
        toast.error(`Upgrade failed: ${status.message}`);
      } else {
        // Any in-progress status — mark that upgrade has started on backend
        untracked(() => this.#sawUpgrading.set(true));
      }
    });
  }

  async startUpgrade(): Promise<void> {
    const storage = this.storage();
    const canisterId = storage.canisterId;
    if (!canisterId) return;

    this.#step.set('upgrading');
    this.#isPreparing.set(true);
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
  }
}
