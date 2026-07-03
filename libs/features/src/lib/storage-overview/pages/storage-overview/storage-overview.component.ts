import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleAlert,
  lucideFolder,
  lucideHardDrive,
  lucideRefreshCw,
} from '@ng-icons/lucide';

import { PageHeaderActionsDirective } from '@rabbithole/core';
import {
  ENCRYPTED_STORAGE_CANISTER_ID,
  provideEncryptedStorageActor,
} from '@rabbithole/core/storage-runtime';
import type { ExternalStorageTargetView } from '@rabbithole/declarations/encrypted-storage';
import { CopyToClipboardComponent } from '@rabbithole/ui/copy-to-clipboard';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmButtonGroupImports } from '@spartan-ng/helm/button-group';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { ExternalStorageTargetsService } from '../../services/external-storage-targets.service';
import { formatSize, targetLabel } from '../../utils';

@Component({
  selector: 'rbth-feat-storage-overview',
  templateUrl: './storage-overview.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [
    RouterLink,
    NgIcon,
    HlmIcon,
    HlmSpinner,
    ...HlmAlertImports,
    ...HlmButtonGroupImports,
    ...HlmButtonImports,
    ...HlmCardImports,
    ...HlmTooltipImports,
    CopyToClipboardComponent,
    PageHeaderActionsDirective,
  ],
  providers: [
    provideEncryptedStorageActor(),
    ExternalStorageTargetsService,
    provideIcons({
      lucideCircleAlert,
      lucideFolder,
      lucideHardDrive,
      lucideRefreshCw,
    }),
  ],
})
export class StorageOverviewComponent {
  readonly #canisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID);
  protected readonly _canisterId = this.#canisterId.toText();

  readonly #targets = inject(ExternalStorageTargetsService);

  protected readonly _credentialBlockedTargets = computed(() =>
    this.#targets
      .targets()
      .filter((target) => 'CredentialFailed' in target.status),
  );

  protected readonly _directoryCount = computed(() => {
    const status = this.#targets.storageStatus();
    return status ? Number(status.directoryCount) : null;
  });

  protected readonly _fileCount = computed(() => {
    const status = this.#targets.storageStatus();
    return status ? Number(status.fileCount) : null;
  });

  protected readonly _releaseTag = this.#targets.releaseTag;

  /** The vault demands an external bucket but none is connected yet. */
  protected readonly _setupRequired = computed(
    () =>
      this.#targets.storageStatus()?.objectStorage[0]?.setupRequired === true,
  );

  protected readonly _statusResource = this.#targets.storageStatusResource;

  protected readonly _usedSpaceLabel = computed(() => {
    const status = this.#targets.storageStatus();
    return status ? formatSize(status.storedBytesUsed) : null;
  });

  protected _refresh(): void {
    this.#targets.refresh();
  }

  protected _targetLabel(target: ExternalStorageTargetView): string {
    return targetLabel(target);
  }
}
