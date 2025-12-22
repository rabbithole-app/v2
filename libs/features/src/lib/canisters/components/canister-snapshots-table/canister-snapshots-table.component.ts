import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCamera,
  lucideHistory,
  lucideRefreshCw,
  lucideReplace,
  lucideTrash2,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmButtonGroupImports } from '@spartan-ng/helm/button-group';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { HlmTableImports } from '@spartan-ng/helm/table';
import {
  ColumnDef,
  createAngularTable,
  FlexRenderDirective,
  getCoreRowModel,
} from '@tanstack/angular-table';

import { Snapshot } from '@rabbithole/core';
import { CopyToClipboardComponent, FormatBytesPipe } from '@rabbithole/core';
import { RbthTooltipTriggerDirective } from '@rabbithole/ui';

interface SnapshotItem {
  snapshot: Snapshot;
}

@Component({
  selector: 'rbth-feat-canisters-canister-snapshots-table',
  imports: [
    FlexRenderDirective,
    NgIcon,
    HlmIcon,
    HlmButton,
    HlmSpinner,
    ...HlmButtonGroupImports,
    ...HlmTableImports,
    CopyToClipboardComponent,
    DatePipe,
    FormatBytesPipe,
    RbthTooltipTriggerDirective,
  ],
  providers: [
    provideIcons({
      lucideCamera,
      lucideHistory,
      lucideRefreshCw,
      lucideReplace,
      lucideTrash2,
    }),
  ],
  templateUrl: './canister-snapshots-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'w-full space-y-4',
  },
})
export class CanisterSnapshotsTableComponent {
  deleteSnapshot = output<string>();
  loadingState = input<{
    deleting: string[];
    loading: boolean;
    replacing: string | null;
    restoreStatus: 'idle' | 'restoring' | 'starting' | 'stopping';
    takeStatus: 'idle' | 'starting' | 'stopping' | 'taking';
  }>({
    deleting: [],
    loading: false,
    replacing: null,
    restoreStatus: 'idle',
    takeStatus: 'idle',
  });
  reloadSnapshots = output<void>();
  restoreSnapshot = output<string>();
  snapshots = input.required<Snapshot[]>();
  takeSnapshot = output<string | void>();

  protected readonly _columns = computed<ColumnDef<SnapshotItem>[]>(() => [
    {
      header: 'Snapshot',
      accessorFn: (row) => row.snapshot.id,
      id: 'snapshot',
      cell: ({ row }) => row.original.snapshot.id,
    },
    {
      header: 'Size',
      accessorFn: (row) => row.snapshot.totalSize,
      id: 'size',
      cell: ({ row }) => row.original.snapshot.totalSize,
    },
    {
      header: 'Timestamp',
      accessorFn: (row) => row.snapshot.takenAtTimestamp,
      id: 'timestamp',
      cell: ({ row }) => row.original.snapshot.takenAtTimestamp,
    },
    {
      id: 'actions',
      header: 'Actions',
      enableHiding: false,
      cell: ({ row }) => row.original.snapshot.id,
    },
  ]);

  protected _isTakeSnapshotDisabled = computed(() => {
    const state = this.loadingState();
    return state.takeStatus !== 'idle' || state.restoreStatus !== 'idle';
  });

  protected get table(): ReturnType<typeof createAngularTable<SnapshotItem>> {
    return this._table;
  }

  private readonly _snapshotsData = computed(() => {
    return this.snapshots().map((snapshot) => ({
      snapshot,
    }));
  });

  private readonly _table = createAngularTable<SnapshotItem>(() => ({
    data: this._snapshotsData(),
    columns: this._columns(),
    getCoreRowModel: getCoreRowModel(),
  }));

  protected _isDeleteDisabled = (id: string) => {
    return this.loadingState().deleting.includes(id);
  };

  protected _isDeleteLoading = (id: string) => {
    return this.loadingState().deleting.includes(id);
  };

  protected _isReplaceDisabled = () => {
    const state = this.loadingState();
    return state.replacing !== null;
  };

  protected _isReplaceLoading = (id: string) => {
    return this.loadingState().replacing === id;
  };

  protected _isRestoreDisabled = () => {
    const state = this.loadingState();
    return state.restoreStatus !== 'idle' || state.takeStatus !== 'idle';
  };

  protected _isRestoreLoading = () =>
    this.loadingState().restoreStatus !== 'idle';

  protected _onDeleteSnapshot(id: string) {
    this.deleteSnapshot.emit(id);
  }

  protected _onReloadSnapshots() {
    this.reloadSnapshots.emit();
  }

  protected _onReplaceSnapshot(id: string) {
    this.takeSnapshot.emit(id);
  }

  protected _onRestoreSnapshot(id: string) {
    this.restoreSnapshot.emit(id);
  }

  protected _onTakeSnapshot() {
    this.takeSnapshot.emit();
  }

  protected _toNumber(value: bigint): number {
    return Number(value);
  }
}
