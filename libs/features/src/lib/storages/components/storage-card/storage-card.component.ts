import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Principal } from '@icp-sdk/core/principal';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowUpCircle,
  lucideChevronRight,
  lucideCircleAlert,
  lucideCircleCheck,
  lucideCircleDashed,
  lucideCircleX,
  lucideCode,
  lucideEllipsisVertical,
  lucideExternalLink,
  lucideHardDrive,
  lucideLoader2,
  lucideRefreshCw,
  lucideSettings,
  lucideTrash2,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import {
  BrnAlertDialogContent,
  BrnAlertDialogTrigger,
} from '@spartan-ng/brain/alert-dialog';

import { IS_PRODUCTION_TOKEN } from '@rabbithole/core';
import {
  getStorageCanisterId,
  getStorageDisplayStatus,
  hasBlockedStorageReleaseOption,
  hasInstallableStorageReleaseOption,
  injectStorageReleaseOptionsLoader,
  type LoadStorageReleaseOptions,
  provideEncryptedStorageCanisterId,
  type StorageCreationStatus,
  type StorageDisplayStatus,
  type StorageInfo,
  StoragesService,
} from '@rabbithole/core';
import { CopyToClipboardComponent } from '@rabbithole/ui/copy-to-clipboard';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmButtonGroupImports } from '@spartan-ng/helm/button-group';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmHoverCardImports } from '@spartan-ng/helm/hover-card';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmItemImports } from '@spartan-ng/helm/item';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { UpgradeStorageDialogComponent } from '../upgrade-storage-dialog/upgrade-storage-dialog.component';

const STORAGE_DEV_FRONTEND_ORIGIN = 'http://localhost:4201';

type ReleaseOptionsParams = {
  canisterIdText: string;
  loadStorageReleaseOptions: LoadStorageReleaseOptions;
};

@Component({
  selector: 'rbth-feat-storages-storage-card',
  imports: [
    RouterLink,
    NgIcon,
    HlmIcon,
    HlmBadge,
    HlmSpinner,
    BrnAlertDialogContent,
    BrnAlertDialogTrigger,
    ...HlmAlertImports,
    ...HlmAlertDialogImports,
    ...HlmButtonImports,
    ...HlmButtonGroupImports,
    ...HlmDropdownMenuImports,
    ...HlmHoverCardImports,
    ...HlmItemImports,
    ...HlmTooltipImports,
    CopyToClipboardComponent,
  ],
  providers: [
    provideIcons({
      lucideArrowUpCircle,
      lucideChevronRight,
      lucideCode,
      lucideCircleAlert,
      lucideCircleCheck,
      lucideCircleDashed,
      lucideCircleX,
      lucideEllipsisVertical,
      lucideExternalLink,
      lucideHardDrive,
      lucideLoader2,
      lucideRefreshCw,
      lucideSettings,
      lucideTrash2,
      lucideTriangleAlert,
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
  readonly displayStatus = computed<StorageDisplayStatus>(() =>
    getStorageDisplayStatus(this.storage().status),
  );
  readonly #loadStorageReleaseOptions = injectStorageReleaseOptionsLoader();

  readonly #releaseOptionsParams = computed<ReleaseOptionsParams | null>(
    () => {
      const canisterIdText = this.canisterIdText();
      if (!canisterIdText || this.displayStatus() !== 'completed') {
        return null;
      }

      return {
        canisterIdText,
        loadStorageReleaseOptions: this.#loadStorageReleaseOptions(),
      };
    },
    {
      equal: (a, b) =>
        a?.canisterIdText === b?.canisterIdText &&
        a?.loadStorageReleaseOptions === b?.loadStorageReleaseOptions,
    },
  );

  readonly #releaseOptionsResource = resource({
    params: () => this.#releaseOptionsParams(),
    loader: ({ params }) => {
      if (!params) return Promise.resolve([]);
      const canisterId = Principal.fromText(params.canisterIdText);
      return params.loadStorageReleaseOptions(canisterId);
    },
  });
  readonly releaseOptions = computed(() =>
    this.#releaseOptionsResource.hasValue()
      ? this.#releaseOptionsResource.value()
      : [],
  );
  readonly blockedReleaseOption = computed(() =>
    this.releaseOptions().find(hasBlockedStorageReleaseOption),
  );
  readonly #isProduction = inject(IS_PRODUCTION_TOKEN);
  readonly canisterUrl = computed(() => {
    const canisterId = this.canisterIdText();
    if (!canisterId) return null;

    const domain = this.#isProduction ? 'icp0.io' : 'localhost';
    return `https://${canisterId}.${domain}`;
  });
  readonly errorMessage = computed<string | null>(() => {
    const status = this.storage().status;
    return status.type === 'Failed' ? status.message : null;
  });
  readonly installableReleaseOption = computed(() =>
    this.releaseOptions().find(hasInstallableStorageReleaseOption),
  );
  readonly releaseOptionsLoaded = computed(() =>
    this.#releaseOptionsResource.hasValue(),
  );
  readonly hasUpdate = computed(() => {
    if (!this.releaseOptionsLoaded()) return false;
    return !!this.installableReleaseOption();
  });
  readonly hasBlockedUpdate = computed(
    () =>
      this.releaseOptionsLoaded() &&
      !this.hasUpdate() &&
      !!this.blockedReleaseOption(),
  );

  readonly hasWasmUpdate = computed(() => {
    const info = this.installableReleaseOption()?.updateInfo;
    return this.hasUpdate() && !!info?.wasmUpdateAvailable;
  });
  readonly isDeleting = signal(false);
  readonly isResuming = signal(false);
  readonly lastUpgradeError = computed(
    () => this.storage().lastUpgradeError ?? null,
  );

  readonly showLocalDevFrontendAction = !this.#isProduction;
  readonly statusTooltip = computed<string>(() => {
    const status = this.storage().status;
    const label = getUserFriendlyLabel(status);
    const progress = this.#getProgressText(status);

    return progress ? `${label} (${progress})` : label;
  });
  readonly updateSummary = computed(() => {
    const info = this.installableReleaseOption()?.updateInfo;
    if (!info) return '';
    if (info.wasmUpdateAvailable && info.frontendUpdateAvailable)
      return 'WASM + Frontend';
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
      this.#router.navigate(['/dashboard', canisterId, 'canister']);
    }
  }

  openCanisterFrontend(): void {
    const url = this.canisterUrl();
    if (url) {
      window.open(url, '_blank');
    }
  }

  openLocalDevFrontend(): void {
    const canisterId = this.canisterIdText();
    if (!canisterId || this.#isProduction) return;

    const path = this.#router.serializeUrl(
      this.#router.createUrlTree(['/'], {
        queryParams: { canisterId },
      }),
    );
    window.open(`${STORAGE_DEV_FRONTEND_ORIGIN}${path}`, '_blank');
  }

  openUpgradeDialog(): void {
    if (!this.hasUpdate()) return;
    const canisterId = getStorageCanisterId(this.storage());
    if (!canisterId) return;

    const dialogRef = this.#dialogService.open(UpgradeStorageDialogComponent, {
      contentClass: 'min-w-[500px] sm:max-w-[600px]',
      context: { storage: this.storage() },
      providers: [provideEncryptedStorageCanisterId(canisterId)],
    });

    dialogRef.closed$.subscribe(() => {
      this.#storagesService.clearTrackedUpgrade();
      this.#storagesService.reload();
    });
  }

  async retryFailedStorage(): Promise<void> {
    if (this.isResuming()) return;

    this.isResuming.set(true);
    try {
      await this.#storagesService.resumeFailedStorage(this.storage().id);
    } catch {
      // resumeFailedStorage already shows toast on error
    } finally {
      this.isResuming.set(false);
    }
  }

  #getProgressText(status: StorageCreationStatus): string | null {
    if (
      status.type === 'InstallingWasm' ||
      status.type === 'ReinstallingWasm' ||
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
    case 'CheckingBalance':
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

    case 'ReinstallingWasm':
      return 'Reinstalling storage module...';

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
