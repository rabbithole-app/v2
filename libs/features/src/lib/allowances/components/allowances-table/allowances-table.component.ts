import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronDown,
  lucideEye,
  lucideEyeOff,
  lucideTrash2,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmTableImports } from '@spartan-ng/helm/table';
import {
  ColumnDef,
  createAngularTable,
  FlexRenderDirective,
  getCoreRowModel,
} from '@tanstack/angular-table';

import {
  AllowanceInfo,
  CopyToClipboardComponent,
  formatICP,
} from '@rabbithole/core';
import { RbthTooltipTriggerDirective } from '@rabbithole/ui';

interface AllowanceItem {
  allowance: AllowanceInfo;
}

@Component({
  selector: 'rbth-feat-allowances-table',
  imports: [
    FlexRenderDirective,
    NgIcon,
    HlmIcon,
    HlmButton,
    ...HlmTableImports,
    ...HlmDropdownMenuImports,
    CopyToClipboardComponent,
    DatePipe,
    RbthTooltipTriggerDirective,
  ],
  providers: [
    provideIcons({
      lucideTrash2,
      lucideChevronDown,
      lucideEye,
      lucideEyeOff,
    }),
  ],
  templateUrl: './allowances-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'w-full space-y-4',
  },
})
export class AllowancesTableComponent {
  allowances = input<AllowanceInfo[]>([]);
  revokeAllowance = output<{ fromAccountId: string; toSpenderId: string }>();

  get table(): ReturnType<typeof createAngularTable<AllowanceItem>> {
    return this._table;
  }

  protected readonly _columns = computed<ColumnDef<AllowanceItem>[]>(() => [
    {
      header: 'From Account',
      accessorFn: (row) => row.allowance.fromAccountId,
      id: 'fromAccountId',
      cell: ({ row }) => row.original.allowance.fromAccountId,
      enableHiding: true,
    },
    {
      header: 'To Spender',
      accessorFn: (row) => row.allowance.toSpenderId,
      id: 'toSpenderId',
      cell: ({ row }) => row.original.allowance.toSpenderId,
    },
    {
      header: 'Allowance',
      accessorFn: (row) => row.allowance.allowance,
      id: 'allowance',
      cell: ({ row }) => row.original.allowance.allowance,
    },
    {
      header: 'Expires At',
      accessorFn: (row) => row.allowance.expiresAt,
      id: 'expiresAt',
      cell: ({ row }) => row.original.allowance.expiresAt,
    },
    {
      id: 'actions',
      header: 'Actions',
      enableHiding: false,
      cell: ({ row }) => row.original.allowance.fromAccountId,
    },
  ]);

  private readonly _allowancesData = computed(() => {
    return this.allowances().map((allowance: AllowanceInfo) => ({
      allowance,
    }));
  });

  private readonly _columnVisibility = signal<Record<string, boolean>>({
    fromAccountId: false,
  });

  private readonly _table = createAngularTable<AllowanceItem>(() => ({
    data: this._allowancesData(),
    columns: this._columns(),
    state: {
      columnVisibility: this._columnVisibility(),
    },
    getCoreRowModel: getCoreRowModel(),
    onColumnVisibilityChange: (
      updater:
        | Record<string, boolean>
        | ((old: Record<string, boolean>) => Record<string, boolean>),
    ) =>
      updater instanceof Function
        ? this._columnVisibility.update(updater)
        : this._columnVisibility.set(updater),
  }));

  protected _formatICP(amount: bigint): string {
    return formatICP(amount);
  }

  protected _onRevokeAllowance(fromAccountId: string, toSpenderId: string) {
    this.revokeAllowance.emit({ fromAccountId, toSpenderId });
  }
}
