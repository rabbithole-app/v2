import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideKeyRound, lucideUnplug } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';

import type { ExternalStorageTargetView } from '@rabbithole/declarations/encrypted-storage';
import { CopyToClipboardComponent } from '@rabbithole/ui/copy-to-clipboard';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { ExternalStorageTargetsService } from '../../services/external-storage-targets.service';
import {
  nanosToDate,
  s3Config,
  targetLabel,
  targetStatusLabel,
  targetStatusVariant,
} from '../../utils';
import { DisconnectTargetDialogComponent } from './disconnect-target-dialog.component';

@Component({
  selector: 'rbth-feat-target-history-table',
  templateUrl: './target-history-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'w-full space-y-4' },
  imports: [
    DatePipe,
    NgIcon,
    HlmBadge,
    HlmIcon,
    HlmSpinner,
    ...HlmButtonImports,
    ...HlmTableImports,
    ...HlmTooltipImports,
    CopyToClipboardComponent,
  ],
  providers: [provideIcons({ lucideKeyRound, lucideUnplug })],
})
export class TargetHistoryTableComponent {
  readonly edit = output<ExternalStorageTargetView>();

  readonly #targets = inject(ExternalStorageTargetsService);

  protected readonly _activeTargetId = computed(
    () => this.#targets.activeTarget()?.id ?? null,
  );

  protected readonly _disconnectingTargetId = signal<string | null>(null);

  protected readonly _targets = this.#targets.targets;

  /** Target ids that still hold data or have cleanup in flight. */
  readonly #busyTargetIds = computed(() => {
    const cleanup = this.#targets.cleanup();
    const busy = new Set<string>();
    if (!cleanup) return busy;

    for (const replica of cleanup.replicas) {
      if (!('Deleted' in replica.status)) busy.add(replica.targetId);
    }
    for (const task of cleanup.deleteTasks) {
      if ('Pending' in task.status || 'Running' in task.status) {
        busy.add(task.targetId);
      }
    }
    return busy;
  });

  readonly #dialogService = inject(HlmDialogService);

  protected _canDisconnect(target: ExternalStorageTargetView): boolean {
    return !this.#busyTargetIds().has(target.id);
  }

  protected _formatTime(time: bigint): Date {
    return nanosToDate(time);
  }

  protected _openDisconnectDialog(target: ExternalStorageTargetView): void {
    const dialogRef = this.#dialogService.open(
      DisconnectTargetDialogComponent,
      {
        context: {
          targetLabel: targetLabel(target),
        },
      },
    );

    dialogRef.closed$.subscribe((confirmed) => {
      if (confirmed) {
        void this.#disconnect(target);
      }
    });
  }

  protected _s3Config(target: ExternalStorageTargetView) {
    return s3Config(target);
  }

  protected _statusLabel(target: ExternalStorageTargetView): string {
    return targetStatusLabel(target.status);
  }

  protected _statusVariant(target: ExternalStorageTargetView) {
    return targetStatusVariant(target.status);
  }

  protected _targetLabel(target: ExternalStorageTargetView): string {
    return targetLabel(target);
  }

  async #disconnect(target: ExternalStorageTargetView): Promise<void> {
    this._disconnectingTargetId.set(target.id);
    try {
      await this.#targets.disconnect(target.id);
      toast.success(`${targetLabel(target)} disconnected`);
    } catch (error) {
      toast.error(this.#targets.describeError(error));
    } finally {
      this._disconnectingTargetId.set(null);
    }
  }
}
