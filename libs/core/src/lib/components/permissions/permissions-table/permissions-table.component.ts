import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Principal } from '@icp-sdk/core/principal';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown, lucideUserPlus } from '@ng-icons/lucide';
import { BrnSelectImports } from '@spartan-ng/brain/select';
import {
  ColumnDef,
  ColumnFiltersState,
  createAngularTable,
  FilterFn,
  flexRenderComponent,
  FlexRenderDirective,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  PaginationState,
  Row,
  SortingFn,
  SortingState,
} from '@tanstack/angular-table';

import { AUTH_SERVICE } from '@rabbithole/auth';
import type {
  GrantStoragePermission,
  RevokeStoragePermission,
  StoragePermissionItem,
} from '@rabbithole/encrypted-storage';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { hlmMuted } from '@spartan-ng/helm/typography';

import {
  PermissionCell,
  PrincipalCell,
  TableHeadSelection,
  TableHeadSortButton,
  TableRowSelection,
} from '../../ui/tanstack';
import { EditPermissionFormComponent } from '../edit-permission-form/edit-permission-form';
import { EditPermissionFormTriggerDirective } from '../edit-permission-form/edit-permission-form-trigger';
import { ActionsCellComponent } from './actions-cell';

const permissionSortingFn: SortingFn<StoragePermissionItem> = (
  rowA: Row<StoragePermissionItem>,
  rowB: Row<StoragePermissionItem>,
  columnId: string,
) => {
  const permissionA =
      rowA.getValue<StoragePermissionItem['permission']>(columnId),
    permissionB = rowB.getValue<StoragePermissionItem['permission']>(columnId);
  if (permissionA === permissionB) return 0;
  if (
    (permissionA === 'ReadWriteManage' &&
      ['Read', 'ReadWrite'].includes(permissionB)) ||
    (permissionA === 'ReadWrite' && permissionB === 'Read')
  )
    return 1;
  return -1;
};

const statusFilterFn: FilterFn<StoragePermissionItem> = (
  row,
  columnId,
  filterValue: string[],
) => {
  if (!filterValue?.length) return true;
  const status = row.getValue(columnId) as string;
  return filterValue.includes(status);
};

@Component({
  selector: 'core-permissions-table',
  imports: [
    FlexRenderDirective,
    FormsModule,
    HlmDropdownMenuImports,
    NgIcon,
    HlmIcon,
    HlmInput,
    BrnSelectImports,
    HlmSelectImports,
    EditPermissionFormComponent,
    HlmButton,
    EditPermissionFormTriggerDirective,
    ...HlmTableImports,
  ],
  providers: [provideIcons({ lucideChevronDown, lucideUserPlus })],
  host: {
    class: 'w-full space-y-4',
  },
  templateUrl: './permissions-table.component.html',
})
export class PermissionsTableComponent {
  #authService = inject(AUTH_SERVICE);
  currentPrincipalId = computed(() => this.#authService.principalId());
  data = input<StoragePermissionItem[]>([]);
  grant = output<Omit<GrantStoragePermission, 'entry'>>();
  readonly hlmMuted = hlmMuted;
  revoke = output<Omit<RevokeStoragePermission, 'entry'>>();
  protected readonly _availablePageSizes = [5, 10, 20, 10000];
  protected readonly _columns = computed<ColumnDef<StoragePermissionItem>[]>(
    () => [
      {
        accessorKey: 'select',
        id: 'select',
        header: () => flexRenderComponent(TableHeadSelection),
        cell: () => flexRenderComponent(TableRowSelection),
        enableSorting: false,
        enableHiding: false,
      },
      {
        header: 'Principal ID',
        accessorKey: 'user',
        id: 'user',
        cell: ({ row }) =>
          flexRenderComponent(PrincipalCell, {
            inputs: {
              isBold:
                row.getValue<string>('user') === this.currentPrincipalId(),
            },
          }),
      },
      {
        accessorKey: 'permission',
        id: 'permission',
        header: () =>
          flexRenderComponent(TableHeadSortButton, {
            inputs: { header: 'Permission' },
          }),
        cell: ({ row }) =>
          flexRenderComponent(PermissionCell, {
            inputs: {
              permission: row.getValue('permission'),
            },
          }),
        size: 100,
        filterFn: statusFilterFn,
        sortingFn: permissionSortingFn,
      },
      {
        id: 'action',
        header: 'Actions',
        enableHiding: false,
        cell: ({ row }) =>
          flexRenderComponent(ActionsCellComponent, {
            inputs: {},
            outputs: {
              edit: (args) => this.grant.emit(args),
              revoke: () =>
                this.revoke.emit({
                  user: Principal.fromText(row.getValue<string>('user')),
                }),
            },
          }),
      },
    ],
  );

  private readonly _columnFilters = signal<ColumnFiltersState>([]);
  private readonly _pagination = signal<PaginationState>({
    pageSize: 5,
    pageIndex: 0,
  });
  private readonly _sorting = signal<SortingState>([]);
  protected readonly _table = createAngularTable<StoragePermissionItem>(() => ({
    // data: this.#permissionsService.listPermitted.value(),
    data: this.data(),
    columns: this._columns(),
    state: {
      columnFilters: this._columnFilters(),
      sorting: this._sorting(),
      pagination: this._pagination(),
    },
    onColumnFiltersChange: (updater) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      updater instanceof Function
        ? this._columnFilters.update(updater)
        : this._columnFilters.set(updater);
    },
    onSortingChange: (updater) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      updater instanceof Function
        ? this._sorting.update(updater)
        : this._sorting.set(updater);
    },
    onPaginationChange: (updater) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      updater instanceof Function
        ? this._pagination.update(updater)
        : this._pagination.set(updater);
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  }));
  protected readonly _hidableColumns = this._table
    .getAllColumns()
    .filter((column) => column.getCanHide());

  protected _filterChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const typedValue = target.value;
    this._table.setGlobalFilter(typedValue);
  }

  protected _filterChanged(event: Event) {
    this._table
      .getColumn('principal')
      ?.setFilterValue((event.target as HTMLInputElement).value);
  }
}
