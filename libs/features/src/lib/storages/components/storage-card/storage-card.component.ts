import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowUpCircle,
  lucideChevronRight,
  lucideCircleAlert,
  lucideCircleCheck,
  lucideCircleDashed,
  lucideCircleX,
  lucideEllipsisVertical,
  lucideExternalLink,
  lucideHardDrive,
  lucideLoader2,
  lucideSettings,
  lucideTrash2,
} from '@ng-icons/lucide';

import { CopyToClipboardComponent, IS_PRODUCTION_TOKEN } from '@rabbithole/core';
import {
  getStorageCanisterId,
  getStorageDisplayStatus,
  type StorageCreationStatus,
  type StorageDisplayStatus,
  type StorageInfo,
  StoragesService,
} from '@rabbithole/core';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmButtonGroupImports } from '@spartan-ng/helm/button-group';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmItemImports } from '@spartan-ng/helm/item';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { UpgradeStorageDialogComponent } from '../upgrade-storage-dialog/upgrade-storage-dialog.component';

@Component({
  selector: 'rbth-feat-storages-storage-card',
  imports: [
    RouterLink,
    NgIcon,
    HlmIcon,
    HlmBadge,
    HlmSpinner,
    ...HlmButtonImports,
    ...HlmButtonGroupImports,
    ...HlmDropdownMenuImports,
    ...HlmItemImports,
    ...HlmTooltipImports,
    CopyToClipboardComponent,
  ],
  providers: [
    provideIcons({
      lucideArrowUpCircle,
      lucideChevronRight,
      lucideCircleAlert,
      lucideCircleCheck,
      lucideCircleDashed,
      lucideCircleX,
      lucideEllipsisVertical,
      lucideExternalLink,
      lucideHardDrive,
      lucideLoader2,
      lucideSettings,
      lucideTrash2,
    }),
  ],
  templateUrl: './storage-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorageCardComponent {
  readonly storage = input.required<StorageInfo>();

  readonly canisterIdText = computed(() => {
    const canisterId = getStorageCanisterId(this.storage());
    return canisterId?.toText() ?? null;
  });
  readonly #isProduction = inject(IS_PRODUCTION_TOKEN);

  readonly canisterUrl = computed(() => {
    const canisterId = this.canisterIdText();
    if (!canisterId) return null;

    const domain = this.#isProduction ? 'icp0.io' : 'localhost';
    return `https://${canisterId}.${domain}`;
  });

  readonly displayStatus = computed<StorageDisplayStatus>(() =>
    getStorageDisplayStatus(this.storage().status),
  );

  readonly errorMessage = computed<string | null>(() => {
    const status = this.storage().status;
    return status.type === 'Failed' ? status.message : null;
  });

  readonly hasUpdate = computed(() => !!this.storage().updateAvailable);
  readonly hasWasmUpdate = computed(
    () => !!this.storage().updateAvailable?.wasmUpdateAvailable,
  );
  readonly isDeleting = signal(false);

  readonly statusTooltip = computed<string>(() => {
    const status = this.storage().status;
    const label = getUserFriendlyLabel(status);
    const progress = this.#getProgressText(status);

    return progress ? `${label} (${progress})` : label;
  });
  readonly updateSummary = computed(() => {
    const info = this.storage().updateAvailable;
    if (!info) return '';
    if (info.wasmUpdateAvailable && info.frontendUpdateAvailable) return 'WASM + Frontend';
    if (info.wasmUpdateAvailable) return 'WASM';
    return 'Frontend';
  });
  readonly #dialogService = inject(HlmDialogService);
  readonly #router = inject(Router);

  readonly #storagesService = inject(StoragesService);

  async deleteStorage(): Promise<void> {
    if (this.isDeleting()) return;

    this.isDeleting.set(true);
    try {
      await this.#storagesService.deleteStorage(this.storage().id);
    } finally {
      this.isDeleting.set(false);
    }
  }

  navigateToCanisterManagement(): void {
    const canisterId = this.canisterIdText();
    if (canisterId) {
      this.#router.navigate(['/canisters', canisterId]);
    }
  }

  openCanisterFrontend(): void {
    const url = this.canisterUrl();
    if (url) {
      window.open(url, '_blank');
    }
  }

  openUpgradeDialog(): void {
    const dialogRef = this.#dialogService.open(UpgradeStorageDialogComponent, {
      contentClass: 'min-w-[500px] sm:max-w-[600px]',
      context: { storage: this.storage() },
    });

    dialogRef.closed$.subscribe(() => {
      this.#storagesService.clearTrackedUpgrade();
      this.#storagesService.reload();
    });
  }

  #getProgressText(status: StorageCreationStatus): string | null {
    if (
      status.type === 'InstallingWasm' ||
      status.type === 'UploadingFrontend' ||
      status.type === 'UpgradingWasm' ||
      status.type === 'UpgradingFrontend'
    ) {
      const { processed, total } = status.progress;
      if (total > 0) {
        const percent = Math.round((processed * 100) / total);
        return `${percent}%`;
      }
    }
    return null;
  }
}

/**
 * User-friendly labels for technical status types
 */
function getUserFriendlyLabel(status: StorageCreationStatus): string {
  switch (status.type) {
    case 'CanisterCreated':
    case 'CheckingAllowance':
    case 'NotifyingCMC':
    case 'Pending':
    case 'TransferringICP':
      return 'Creating canister...';

    case 'Completed':
      return 'Ready to use';

    case 'Failed':
      return 'Setup failed';

    case 'InstallingWasm':
      return 'Installing storage module...';

    case 'UpdatingControllers':
      return 'Finalizing setup...';

    case 'UpgradingFrontend':
      return 'Upgrading interface...';

    case 'UpgradingWasm':
      return 'Upgrading storage module...';

    case 'UploadingFrontend':
      return 'Setting up interface...';

    default:
      return 'Processing...';
  }
}
