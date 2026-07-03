import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleAlert,
  lucideCircleCheck,
  lucideDatabase,
  lucideRefreshCw,
  lucideTimer,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import {
  type ColumnDef,
  createAngularTable,
  getCoreRowModel,
  getPaginationRowModel,
  type PaginationState,
} from '@tanstack/angular-table';

import { CoreTransparentSelectBackdropDirective } from '@rabbithole/core/ui';
import type {
  DeleteTaskStatus,
  ExternalStorageDeleteTaskView,
} from '@rabbithole/declarations/encrypted-storage';
import {
  RbthMetricCardComponent,
  RbthMetricCardContentDirective,
  RbthMetricCardHeaderDirective,
  RbthMetricCardTitleDirective,
} from '@rabbithole/ui/metric-card';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmItemImports } from '@spartan-ng/helm/item';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { ExternalStorageTargetsService } from '../../services/external-storage-targets.service';
import { type BadgeVariant, compareTimeDesc, nanosToDate } from '../../utils';

@Component({
  selector: 'rbth-feat-cleanup-section',
  templateUrl: './cleanup-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'w-full space-y-4' },
  imports: [
    DatePipe,
    FormsModule,
    NgIcon,
    CoreTransparentSelectBackdropDirective,
    HlmBadge,
    HlmIcon,
    HlmSpinner,
    RbthMetricCardComponent,
    RbthMetricCardContentDirective,
    RbthMetricCardHeaderDirective,
    RbthMetricCardTitleDirective,
    ...HlmAlertImports,
    ...HlmButtonImports,
    ...HlmEmptyImports,
    ...HlmItemImports,
    ...HlmSelectImports,
    ...HlmTableImports,
    ...HlmTooltipImports,
  ],
  providers: [
    provideIcons({
      lucideCircleAlert,
      lucideCircleCheck,
      lucideDatabase,
      lucideRefreshCw,
      lucideTimer,
      lucideTriangleAlert,
    }),
  ],
})
export class CleanupSectionComponent {
  protected readonly _availablePageSizes = [5, 10, 20, 10000];

  readonly #targets = inject(ExternalStorageTargetsService);

  protected readonly _cleanup = this.#targets.cleanup;

  protected readonly _cleanupResource = this.#targets.cleanupResource;

  protected readonly _counts = computed(() => {
    const summary = this._cleanup()?.summary;
    if (!summary) {
      return {
        activeReplicas: 0,
        pendingDeletes: 0,
        doneDeletes: 0,
        missingReplicas: 0,
      };
    }

    return {
      activeReplicas: Number(summary.activeReplicas),
      pendingDeletes: Number(summary.pendingTasks + summary.runningTasks),
      doneDeletes: Number(summary.doneTasks),
      missingReplicas: Number(summary.missingReplicas),
    };
  });

  readonly #columns: ColumnDef<ExternalStorageDeleteTaskView>[] = [
    { accessorKey: 'rootHashHex', id: 'rootHashHex' },
    { accessorKey: 'attempts', id: 'attempts' },
  ];

  readonly #pagination = signal<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  readonly #rows = computed(() => {
    const tasks = this._cleanup()?.deleteTasks ?? [];
    return [...tasks].sort((a, b) => compareTimeDesc(a.updatedAt, b.updatedAt));
  });

  protected readonly _table = createAngularTable<ExternalStorageDeleteTaskView>(
    () => ({
      data: this.#rows(),
      columns: this.#columns,
      state: {
        pagination: this.#pagination(),
      },
      getCoreRowModel: getCoreRowModel(),
      getPaginationRowModel: getPaginationRowModel(),
      onPaginationChange: (updater) =>
        updater instanceof Function
          ? this.#pagination.update(updater)
          : this.#pagination.set(updater),
    }),
  );

  protected _formatTime(time: bigint): Date {
    return nanosToDate(time);
  }

  protected _loadErrorMessage(error: unknown): string {
    return this.#targets.describeError(error);
  }

  protected _statusLabel(task: ExternalStorageDeleteTaskView): string {
    const status: DeleteTaskStatus = task.status;
    if ('Pending' in status) {
      return task.lastError.length > 0 ? 'Retrying' : 'Pending';
    }
    if ('Running' in status) return 'Running';
    if ('Done' in status) return 'Done';
    if ('Cancelled' in status) return 'Cancelled';
    return 'Unknown';
  }

  protected _statusVariant(task: ExternalStorageDeleteTaskView): BadgeVariant {
    const status: DeleteTaskStatus = task.status;
    if ('Done' in status) return 'secondary';
    if ('Running' in status) return 'default';
    if ('Cancelled' in status) return 'secondary';
    return task.lastError.length > 0 ? 'destructive' : 'outline';
  }
}
