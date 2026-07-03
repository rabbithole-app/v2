import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleAlert,
  lucideCloud,
  lucideKeyRound,
  lucidePlug,
  lucideRefreshCw,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';

import {
  PageHeaderActionsDirective,
  ProFeatureGateService,
} from '@rabbithole/core';
import {
  provideEncryptedStorageActor,
  provideEncryptedStorageCanisterIdFromRouteParam,
} from '@rabbithole/core/storage-runtime';
import type { ExternalStorageTargetView } from '@rabbithole/declarations/encrypted-storage';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmButtonGroupImports } from '@spartan-ng/helm/button-group';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmItemImports } from '@spartan-ng/helm/item';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { CleanupSectionComponent } from '../../components/cleanup-section/cleanup-section.component';
import { CurrentTargetFrameComponent } from '../../components/current-target-frame/current-target-frame.component';
import { TargetConfigDialogComponent } from '../../components/target-config-dialog/target-config-dialog.component';
import { TargetHistoryTableComponent } from '../../components/target-history-table/target-history-table.component';
import { ExternalStorageTargetsService } from '../../services/external-storage-targets.service';
import { targetLabel } from '../../utils';

@Component({
  selector: 'rbth-feat-data-storage',
  templateUrl: './data-storage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [
    NgIcon,
    HlmIcon,
    HlmSpinner,
    ...HlmAlertImports,
    ...HlmButtonGroupImports,
    ...HlmButtonImports,
    ...HlmCardImports,
    ...HlmItemImports,
    ...HlmSkeletonImports,
    ...HlmTooltipImports,
    CleanupSectionComponent,
    CurrentTargetFrameComponent,
    PageHeaderActionsDirective,
    TargetConfigDialogComponent,
    TargetHistoryTableComponent,
  ],
  providers: [
    provideEncryptedStorageCanisterIdFromRouteParam(),
    provideEncryptedStorageActor(),
    ExternalStorageTargetsService,
    provideIcons({
      lucideCircleAlert,
      lucideCloud,
      lucideKeyRound,
      lucidePlug,
      lucideRefreshCw,
    }),
  ],
})
export class DataStorageComponent {
  readonly #targets = inject(ExternalStorageTargetsService);

  protected readonly _activeTarget = this.#targets.activeTarget;

  protected readonly _configDialog = viewChild.required(
    TargetConfigDialogComponent,
  );

  protected readonly _credentialBlockedTargets = computed(() =>
    this.#targets
      .targets()
      .filter((target) => 'CredentialFailed' in target.status),
  );

  protected readonly _missingReplicas = computed(() =>
    (this.#targets.cleanup()?.replicas ?? []).filter(
      (replica) => 'Missing' in replica.status,
    ),
  );

  protected readonly _revalidatingTargetId = signal<string | null>(null);

  protected readonly _setupRequired = computed(
    () =>
      this.#targets.storageStatus()?.objectStorage[0]?.setupRequired === true,
  );

  protected readonly _targetsResource = this.#targets.targetsResource;

  readonly #proFeatureGate = inject(ProFeatureGateService);

  constructor() {
    // Cleanup runs autonomously inside the canister; poll while work is queued
    // so the counters and task list follow it without manual refreshes.
    effect((onCleanup) => {
      const summary = this.#targets.cleanup()?.summary;
      if (!summary) return;
      if (summary.pendingTasks + summary.runningTasks === 0n) return;

      const timer = setTimeout(() => this.#targets.refreshCleanup(), 5_000);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected _loadErrorMessage(error: unknown): string {
    return this.#targets.describeError(error);
  }

  protected async _openConnectDialog(): Promise<void> {
    // Connecting a new external target is a Pro feature; the storage canister
    // enforces the same rule on configure.
    await this.#proFeatureGate.run('external-storage', () =>
      this._configDialog().open('new'),
    );
  }

  protected _openEditDialog(target: ExternalStorageTargetView): void {
    this._configDialog().open('rotate', target);
  }

  protected _refresh(): void {
    this.#targets.refresh();
  }

  protected async _revalidate(target: ExternalStorageTargetView): Promise<void> {
    this._revalidatingTargetId.set(target.id);
    try {
      await this.#targets.revalidate(target.id);
      toast.success('Bucket access verified, cleanup resumed');
    } catch (error) {
      toast.error(this.#targets.describeError(error));
    } finally {
      this._revalidatingTargetId.set(null);
    }
  }

  protected _targetLabel(target: ExternalStorageTargetView): string {
    return targetLabel(target);
  }
}
