import { CommonModule, DatePipe } from '@angular/common';
import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown, lucideEye, lucideEyeOff } from '@ng-icons/lucide';
import { BrnMenuTrigger } from '@spartan-ng/brain/menu';
import { BrnSelectImports } from '@spartan-ng/brain/select';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmMenuImports } from '@spartan-ng/helm/menu';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { hlmMuted } from '@spartan-ng/helm/typography';
import {
  ColumnDef,
  ColumnFiltersState,
  createAngularTable,
  FlexRenderDirective,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  PaginationState,
  SortingState,
} from '@tanstack/angular-table';

import { CopyToClipboardComponent } from '../copy-to-clipboard/copy-to-clipboard.component';

export interface Profile {
  avatarUrl?: string;
  createdAt: Date;
  displayName?: string;
  id: string;
  inviter?: string;
  updatedAt: Date;
  username: string;
}

@Component({
  selector: 'rbth-users-table',
  imports: [
    CommonModule,
    FormsModule,
    FlexRenderDirective,
    BrnMenuTrigger,
    HlmMenuImports,
    NgIcon,
    HlmIcon,
    BrnSelectImports,
    HlmSelectImports,
    HlmButton,
    CopyToClipboardComponent,
    ...HlmTableImports,
  ],
  providers: [
    provideIcons({ lucideChevronDown, lucideEye, lucideEyeOff }),
    DatePipe,
  ],
  host: {
    class: 'w-full flex flex-col',
  },
  templateUrl: './users-table.component.html',
})
export class UsersTableComponent {
  // External state for synchronization
  currentPageIndex = input<number>(0);
  currentPageSize = input<number>(10);
  data = input<Profile[]>([]);

  readonly hlmMuted = hlmMuted;

  loading = input<boolean>(false);
  pageChange = output<{ pageIndex: number; pageSize: number }>();
  totalCount = input<number>(0);

  protected readonly _availablePageSizes = [5, 10, 20, 50, 100];
  protected readonly _columns: ColumnDef<Profile>[] = [
    {
      header: 'User',
      accessorKey: 'username',
      id: 'user',
      cell: ({ row }) => ({ profile: row.original }),
      enableSorting: false,
    },
    {
      header: 'Created at',
      accessorKey: 'createdAt',
      id: 'createdAt',
      cell: ({ row }) => ({ date: row.getValue<Date>('createdAt') }),
    },
    {
      header: 'Updated at',
      accessorKey: 'updatedAt',
      id: 'updatedAt',
      cell: ({ row }) => ({ date: row.getValue<Date>('updatedAt') }),
      enableHiding: true,
    },
  ];
  private readonly _columnFilters = signal<ColumnFiltersState>([]);
  private readonly _columnVisibility = signal<Record<string, boolean>>({
    updatedAt: false,
  });

  private readonly _sorting = signal<SortingState>([]);

  // Stable table configuration
  private readonly _tableConfig = computed(() => {
    const totalCount = this.totalCount();
    const pageSize = this.currentPageSize();
    const pageIndex = this.currentPageIndex();
    const pageCount = totalCount > 0 ? Math.ceil(totalCount / pageSize) : 1;

    return {
      data: this.data(),
      columns: this._columns,
      state: {
        columnFilters: this._columnFilters(),
        sorting: this._sorting(),
        pagination: {
          pageIndex,
          pageSize,
        },
        columnVisibility: this._columnVisibility(),
      },
      onColumnFiltersChange: (
        updater:
          | ColumnFiltersState
          | ((old: ColumnFiltersState) => ColumnFiltersState),
      ) =>
        updater instanceof Function
          ? this._columnFilters.update(updater)
          : this._columnFilters.set(updater),
      onSortingChange: (
        updater: SortingState | ((old: SortingState) => SortingState),
      ) =>
        updater instanceof Function
          ? this._sorting.update(updater)
          : this._sorting.set(updater),
      onPaginationChange: (
        updater: PaginationState | ((old: PaginationState) => PaginationState),
      ) => {
        // Don't update internal state as we use external state
        if (typeof updater === 'function') {
          const newState = updater({ pageIndex, pageSize });
          this.pageChange.emit(newState);
        } else {
          this.pageChange.emit(updater);
        }
      },
      onColumnVisibilityChange: (
        updater:
          | Record<string, boolean>
          | ((old: Record<string, boolean>) => Record<string, boolean>),
      ) =>
        updater instanceof Function
          ? this._columnVisibility.update(updater)
          : this._columnVisibility.set(updater),
      getCoreRowModel: getCoreRowModel(),
      getFilteredRowModel: getFilteredRowModel(),
      getSortedRowModel: getSortedRowModel(),
      // Remove client-side pagination as data comes from server
      // getPaginationRowModel: getPaginationRowModel(),
      manualPagination: true, // Enable server-side pagination
      pageCount, // Total number of pages
      initialState: {
        pagination: {
          pageSize: 10,
        },
      },
    };
  });

  private readonly _table = createAngularTable<Profile>(() =>
    this._tableConfig(),
  );
  protected readonly _hidableColumns = this._table
    .getAllColumns()
    .filter((column) => column.getCanHide());

  // Getter for template access
  protected get table(): ReturnType<typeof createAngularTable<Profile>> {
    return this._table;
  }

  private readonly _pagination = signal<PaginationState>({
    pageSize: 10,
    pageIndex: 0,
  });

  protected _onPageChange(pageIndex: number) {
    this.pageChange.emit({ pageIndex, pageSize: this.currentPageSize() });
  }

  protected _onPageSizeChange(pageSize: number[] | number | undefined) {
    if (typeof pageSize === 'number') {
      this.pageChange.emit({ pageIndex: 0, pageSize });
    }
  }

  protected _toggleColumnVisibility(columnId: string) {
    const currentVisibility = this._columnVisibility();
    this._columnVisibility.set({
      ...currentVisibility,
      [columnId]: !currentVisibility[columnId],
    });
  }
}
