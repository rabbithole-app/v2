import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Principal } from '@dfinity/principal';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown, lucideUserPlus } from '@ng-icons/lucide';
import { BrnMenuTrigger } from '@spartan-ng/brain/menu';
import { BrnSelectModule } from '@spartan-ng/brain/select';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmMenuModule } from '@spartan-ng/helm/menu';
import { HlmSelectModule } from '@spartan-ng/helm/select';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { hlmMuted } from '@spartan-ng/helm/typography';
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

import { EditPermissionFormComponent } from '../edit-permission-form/edit-permission-form';
import { EditPermissionFormTriggerDirective } from '../edit-permission-form/edit-permission-form-trigger';
import { ActionsCellComponent } from './actions-cell';
import { PermissionsItem } from './permissions-table.model';
import {
  GrantPermission,
  Permission,
  RevokePermission,
} from '@rabbithole/assets';
import { ExtractVariantKeys } from '@rabbithole/core';
import {
  PermissionCell,
  PrincipalCell,
  TableHeadSelection,
  TableHeadSortButton,
  TableRowSelection,
} from '@rabbithole/ui/tanstack';

const permissionSortingFn: SortingFn<PermissionsItem> = (
  rowA: Row<PermissionsItem>,
  rowB: Row<PermissionsItem>,
  columnId: string,
) => {
  const permissionA = rowA.getValue<PermissionsItem['permission']>(columnId),
    permissionB = rowB.getValue<PermissionsItem['permission']>(columnId);
  if (permissionA === permissionB) return 0;
  if (
    permissionA === 'Admin' ||
    (permissionA === 'Permissions' &&
      ['Read', 'Write'].includes(permissionB)) ||
    (permissionA === 'Write' && permissionB === 'Read')
  )
    return 1;
  return -1;
};

const statusFilterFn: FilterFn<PermissionsItem> = (
  row,
  columnId,
  filterValue: string[],
) => {
  if (!filterValue?.length) return true;
  const status = row.getValue(columnId) as string;
  return filterValue.includes(status);
};

@Component({
  selector: 'app-permissions-table',
  imports: [
    FlexRenderDirective,
    FormsModule,
    BrnMenuTrigger,
    HlmMenuModule,
    NgIcon,
    HlmIcon,
    HlmInput,
    BrnSelectModule,
    HlmSelectModule,
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
  data = input<PermissionsItem[]>([]);
  grant = output<Omit<GrantPermission, 'entry'>>();
  readonly hlmMuted = hlmMuted;
  revoke = output<Omit<RevokePermission, 'entry'>>();
  protected readonly _availablePageSizes = [5, 10, 20, 10000];
  protected readonly _columns: ColumnDef<PermissionsItem>[] = [
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
      accessorKey: 'principal',
      id: 'principal',
      cell: () => flexRenderComponent(PrincipalCell, { inputs: {} }),
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
            edit: (args) => this.grant.emit(this.prepareGrantArgs(args)),
            revoke: () =>
              this.revoke.emit({
                of_principal: Principal.fromText(
                  row.getValue<string>('principal'),
                ),
                permission: {
                  [row.getValue<string>('permission')]: null,
                } as Permission,
              }),
          },
        }),
    },
  ];

  private readonly _columnFilters = signal<ColumnFiltersState>([]);
  private readonly _pagination = signal<PaginationState>({
    pageSize: 5,
    pageIndex: 0,
  });
  private readonly _sorting = signal<SortingState>([]);
  protected readonly _table = createAngularTable<PermissionsItem>(() => ({
    // data: this.#permissionsService.listPermitted.value(),
    data: this.data(),
    columns: this._columns,
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

  prepareGrantArgs({
    principal,
    permission,
  }: {
    permission: ExtractVariantKeys<Permission>;
    principal: string;
  }) {
    return {
      to_principal: Principal.fromText(principal),
      permission: {
        [permission]: null,
      } as Permission,
    };
  }

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
