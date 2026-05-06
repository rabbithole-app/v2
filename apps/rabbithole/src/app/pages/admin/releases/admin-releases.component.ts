import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  resource,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideChevronDown,
  lucideChevronRight,
  lucideDownload,
  lucideHash,
  lucidePause,
  lucidePlay,
  lucideRefreshCw,
  lucideServerCog,
  lucideTag,
} from '@ng-icons/lucide';
import type { BrnDialogState } from '@spartan-ng/brain/dialog';
import { toast } from 'ngx-sonner';

import {
  formatBytes,
  injectMainActor,
  timeInNanosToDate,
} from '@rabbithole/core';
import {
  AssetFullStatus,
  KnownWasmHash,
  ReleaseFullStatus,
  ReleasesFullStatus,
} from '@rabbithole/declarations/backend';
import { CopyToClipboardComponent } from '@rabbithole/ui/copy-to-clipboard';
import {
  RbthFrameComponent,
  RbthFrameHeaderDirective,
  RbthFramePanelDirective,
  RbthFrameTitleDirective,
} from '@rabbithole/ui/frame';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { HlmTableImports } from '@spartan-ng/helm/table';

const EMPTY_STATUS: ReleasesFullStatus = {
  completedDownloads: 0n,
  defaultVersionKey: '',
  hasDeploymentReadyRelease: false,
  hasDownloadedRelease: false,
  pendingDownloads: 0n,
  releases: [],
  releasesCount: 0n,
};

@Component({
  selector: 'app-admin-releases',
  imports: [
    CopyToClipboardComponent,
    DatePipe,
    HlmBadge,
    HlmInput,
    HlmIcon,
    HlmSpinner,
    NgIcon,
    RbthFrameComponent,
    RbthFrameHeaderDirective,
    RbthFramePanelDirective,
    RbthFrameTitleDirective,
    ...HlmButtonImports,
    ...HlmCardImports,
    ...HlmDialogImports,
    ...HlmTableImports,
  ],
  providers: [
    provideIcons({
      lucideCheck,
      lucideChevronDown,
      lucideChevronRight,
      lucideDownload,
      lucideHash,
      lucidePause,
      lucidePlay,
      lucideRefreshCw,
      lucideServerCog,
      lucideTag,
    }),
  ],
  templateUrl: './admin-releases.component.html',
  host: {
    class: 'flex min-w-0 w-full flex-col gap-6',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminReleasesComponent {
  protected readonly _actionInFlight = signal<string | null>(null);
  readonly #actor = injectMainActor();
  protected readonly _deployerRunning = resource({
    params: () => this.#actor(),
    loader: async ({ params }) => params.isStorageDeployerRunning(),
    defaultValue: false,
  });
  protected readonly _expandedReleaseTags = signal<Set<string>>(new Set());
  protected readonly _knownHashes = resource({
    params: () => this.#actor(),
    loader: async ({ params }) => params.listKnownWasmHashes(),
    defaultValue: [] as KnownWasmHash[],
  });
  protected readonly _manualHash = signal('');
  protected readonly _manualRegisterState = signal<BrnDialogState>('closed');
  protected readonly _manualReleaseTag = signal('');
  protected readonly _status = resource({
    params: () => this.#actor(),
    loader: async ({ params }) => params.getReleasesFullStatus(),
    defaultValue: EMPTY_STATUS,
  });
  protected readonly _releases = computed(() => this._status.value().releases);

  protected _assetDownloadLabel(asset: AssetFullStatus): string {
    const status = asset.downloadStatus;
    if ('Completed' in status) return 'Downloaded';
    if ('Downloading' in status) {
      return `${status.Downloading.chunksCompleted.toString()} / ${status.Downloading.chunksTotal.toString()}`;
    }
    if ('Error' in status) return status.Error;
    return 'Pending';
  }

  protected _assetDownloadVariant(
    asset: AssetFullStatus,
  ): 'default' | 'destructive' | 'outline' | 'secondary' {
    const status = asset.downloadStatus;
    if ('Completed' in status) return 'default';
    if ('Error' in status) return 'destructive';
    if ('Downloading' in status) return 'secondary';
    return 'outline';
  }

  protected _assetExtractionLabel(asset: AssetFullStatus): string {
    const status = asset.extractionStatus[0];
    if (!status) return '';
    if ('Complete' in status) return `${status.Complete.length} files`;
    if ('Decoding' in status) {
      return `${status.Decoding.processed.toString()} / ${status.Decoding.total.toString()}`;
    }
    return 'Idle';
  }

  protected _assetName(asset: AssetFullStatus): string {
    return asset.name;
  }

  protected _date(value: bigint): Date {
    return timeInNanosToDate(value);
  }

  protected _downloadedAssets(release: ReleaseFullStatus): number {
    return release.assets.filter((asset) => 'Completed' in asset.downloadStatus)
      .length;
  }

  protected _errorAssets(release: ReleaseFullStatus): number {
    return release.assets.filter((asset) => 'Error' in asset.downloadStatus)
      .length;
  }

  protected _formatBytes(value: bigint): string {
    return formatBytes(Number(value));
  }

  protected _hashHex(hash: Uint8Array): string {
    return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
  }

  protected _isExpanded(release: ReleaseFullStatus): boolean {
    return this._expandedReleaseTags().has(release.tagName);
  }

  protected _optionalDate(value: [] | [bigint]): Date | null {
    return value[0] ? this._date(value[0]) : null;
  }

  protected async _refreshReleases(): Promise<void> {
    await this._runAction(
      'refresh',
      () => this.#actor().refreshReleases(),
      'Release refresh started',
    );
  }

  protected async _registerLatestWasmHash(): Promise<void> {
    await this._runAction(
      'register-latest',
      () => this.#actor().registerLatestWasmHash(),
      'Latest WASM hash registered',
    );
  }

  protected async _registerManualWasmHash(): Promise<void> {
    this._manualHash.set('');
    this._manualReleaseTag.set('');
    this._manualRegisterState.set('open');
  }

  protected _releaseType(release: ReleaseFullStatus): string {
    if (release.draft) return 'Draft';
    if (release.prerelease) return 'Prerelease';
    return 'Stable';
  }

  protected _releaseTypeVariant(
    release: ReleaseFullStatus,
  ): 'default' | 'outline' | 'secondary' {
    if (release.draft) return 'outline';
    if (release.prerelease) return 'secondary';
    return 'default';
  }

  protected _reload(): void {
    this._status.reload();
    this._knownHashes.reload();
    this._deployerRunning.reload();
  }

  protected async _stopOrStartDeployer(): Promise<void> {
    const shouldStart = !this._deployerRunning.value();
    await this._runAction(
      shouldStart ? 'deployer:start' : 'deployer:stop',
      () =>
        shouldStart
          ? this.#actor().startStorageDeployer()
          : this.#actor().stopStorageDeployer(),
      shouldStart ? 'Storage deployer started' : 'Storage deployer stopped',
    );
  }

  protected async _submitManualWasmHash(): Promise<void> {
    const releaseTag = this._manualReleaseTag().trim();
    const bytes = this._hexToBytes(this._manualHash());
    if (!bytes) {
      toast.error('Invalid WASM hash');
      return;
    }
    if (!releaseTag) {
      toast.error('Release tag is required');
      return;
    }

    await this._runAction(
      'register-manual',
      () => this.#actor().adminRegisterWasmHash(bytes, releaseTag),
      'WASM hash registered',
    );
    this._manualRegisterState.set('closed');
  }

  protected _toggleReleaseExpanded(release: ReleaseFullStatus): void {
    this._expandedReleaseTags.update((current) => {
      const next = new Set(current);
      if (next.has(release.tagName)) {
        next.delete(release.tagName);
      } else {
        next.add(release.tagName);
      }
      return next;
    });
  }

  private _hexToBytes(value: string): Uint8Array | null {
    const normalized = value.trim().replace(/^0x/, '');
    if (!normalized || normalized.length % 2 !== 0) return null;
    if (!/^[0-9a-fA-F]+$/.test(normalized)) return null;

    const bytes = new Uint8Array(normalized.length / 2);
    for (let index = 0; index < normalized.length; index += 2) {
      bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
    }
    return bytes;
  }

  private async _runAction(
    action: string,
    operation: () => Promise<unknown>,
    successMessage: string,
  ): Promise<void> {
    this._actionInFlight.set(action);
    try {
      await operation();
      toast.success(successMessage);
      this._reload();
    } catch (error) {
      console.error(`Failed to run release action ${action}`, error);
      toast.error('Release action failed');
    } finally {
      this._actionInFlight.set(null);
    }
  }
}
