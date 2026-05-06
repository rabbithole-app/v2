import { DatePipe, Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { Principal } from '@icp-sdk/core/principal';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowDown,
  lucideArrowUp,
  lucideArrowUpDown,
  lucideChevronDown,
  lucideChevronLeft,
  lucideChevronRight,
  lucideColumns3,
  lucideRefreshCw,
} from '@ng-icons/lucide';
import {
  ColumnDef,
  ColumnSizingState,
  createAngularTable,
  functionalUpdate,
  getCoreRowModel,
  Updater,
} from '@tanstack/angular-table';
import { endOfDay, startOfDay } from 'date-fns';
import { injectQueryParams } from 'ngxtension/inject-query-params';

import {
  formatICP,
  injectMainActor,
  timeInNanosToDate,
  UserTarget,
  UserTargetComboboxComponent,
  UserTargetComboboxValueDirective,
} from '@rabbithole/core';
import {
  GetLicensesResponse,
  License,
  ListLicensesOptions,
  SortDirection,
  TokenId,
} from '@rabbithole/declarations/backend';
import { CopyToClipboardComponent } from '@rabbithole/ui/copy-to-clipboard';
import {
  RbthBooleanFilterModel,
  RbthDataTableFilterComponent,
  RbthDateFilterModel,
  rbthFilterColumn,
  RbthFiltersState,
  RbthFilterValueDirective,
  RbthMultiOptionFilterModel,
  RbthPrincipalFilterModel,
  RbthTextFilterModel,
} from '@rabbithole/ui/data-table-filter';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { HlmTableImports } from '@spartan-ng/helm/table';

type ColumnId =
  | 'amount'
  | 'canisterId'
  | 'createdAt'
  | 'owner'
  | 'paidAt'
  | 'paymentId'
  | 'refund'
  | 'status';
type DateField = 'createdAt' | 'paidAt';
type SortDirectionName = 'asc' | 'desc';

const EMPTY_PAGE: GetLicensesResponse = {
  data: [],
  instructions: 0n,
  total: [],
};

@Component({
  selector: 'app-admin-licenses',
  imports: [
    CopyToClipboardComponent,
    DatePipe,
    HlmBadge,
    HlmIcon,
    HlmSpinner,
    NgIcon,
    RbthDataTableFilterComponent,
    RbthFilterValueDirective,
    UserTargetComboboxComponent,
    UserTargetComboboxValueDirective,
    ...HlmButtonImports,
    ...HlmDropdownMenuImports,
    ...HlmTableImports,
  ],
  providers: [
    provideIcons({
      lucideArrowDown,
      lucideArrowUp,
      lucideArrowUpDown,
      lucideChevronDown,
      lucideChevronLeft,
      lucideChevronRight,
      lucideColumns3,
      lucideRefreshCw,
    }),
  ],
  templateUrl: './admin-licenses.component.html',
  host: {
    class: 'flex min-w-0 w-full flex-col gap-6',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLicensesComponent {
  protected readonly _columnOptions: Array<{
    id: ColumnId;
    label: string;
    required?: boolean;
  }> = [
    { id: 'owner', label: 'Owner', required: true },
    { id: 'canisterId', label: 'Canister' },
    { id: 'status', label: 'Status' },
    { id: 'amount', label: 'Amount' },
    { id: 'paymentId', label: 'Payment ID' },
    { id: 'paidAt', label: 'Paid' },
    { id: 'refund', label: 'Refund' },
    { id: 'createdAt', label: 'Created' },
  ];
  protected readonly _columns: ColumnDef<License>[] = [
    { id: 'owner', header: 'Owner', minSize: 260, size: 340 },
    { id: 'canisterId', header: 'Canister', minSize: 200, size: 240 },
    { id: 'status', header: 'Status', minSize: 110, size: 130 },
    { id: 'amount', header: 'Amount', minSize: 140, size: 160 },
    { id: 'paymentId', header: 'Payment ID', minSize: 240, size: 320 },
    { id: 'paidAt', header: 'Paid', minSize: 180, size: 210 },
    { id: 'refund', header: 'Refund', minSize: 260, size: 340 },
    { id: 'createdAt', header: 'Created', minSize: 180, size: 210 },
  ];
  protected readonly _columnSizing = signal<ColumnSizingState>({});
  protected readonly _filterColumns = [
    rbthFilterColumn.custom<License>({
      id: 'owner',
      label: 'Owner',
      operators: ['isAnyOf'],
    }),
    rbthFilterColumn.principal<License>({
      id: 'canisterId',
      label: 'Canister',
      operators: ['is', 'isAnyOf'],
    }),
    rbthFilterColumn.text<License>({
      id: 'paymentId',
      label: 'Payment ID',
      operators: ['contains'],
    }),
    rbthFilterColumn.multiOption<License>({
      id: 'statusTag',
      label: 'Status',
      operators: ['include', 'includeAnyOf'],
      options: [
        { label: 'Completed', value: 'completed' },
        { label: 'Refunded', value: 'refunded' },
      ],
    }),
    rbthFilterColumn.boolean<License>({
      falseLabel: 'Unbound',
      id: 'hasCanister',
      label: 'Canister',
      operators: ['is'],
      trueLabel: 'Bound',
    }),
    rbthFilterColumn.date<License>({
      id: 'paidAt',
      label: 'Paid',
      operators: [
        'on',
        'before',
        'onOrBefore',
        'after',
        'onOrAfter',
        'between',
      ],
    }),
    rbthFilterColumn.date<License>({
      id: 'createdAt',
      label: 'Created',
      operators: [
        'on',
        'before',
        'onOrBefore',
        'after',
        'onOrAfter',
        'between',
      ],
    }),
  ];
  protected readonly _filters = signal<RbthFiltersState>([]);
  protected readonly _hiddenColumns = signal<Set<ColumnId>>(
    new Set<ColumnId>(['createdAt', 'refund']),
  );
  protected readonly _pageIndex = signal(0);
  protected readonly _pageSize = signal(20);
  protected readonly _sortField = signal<string>('receipt.paidAt');
  protected readonly _options = computed<ListLicensesOptions>(() => ({
    pagination: {
      offset: BigInt(this._pageIndex() * this._pageSize()),
      limit: BigInt(this._pageSize()),
    },
    count: true,
    sort: [[this._sortField(), this._sortDirectionValue()]],
    filter: {
      id: [],
      owner: this._ownerFilter(),
      canisterId: this._principalFilter('canisterId'),
      paymentId: this._paymentIdFilter(),
      statusTag: this._multiOptionFilter('statusTag'),
      hasCanister: this._booleanFilter('hasCanister'),
      createdAt: this._dateFilter('createdAt'),
      paidAt: this._dateFilter('paidAt'),
    },
  }));
  readonly #actor = injectMainActor();
  protected readonly _licenses = resource({
    params: () => ({
      actor: this.#actor(),
      options: this._options(),
    }),
    loader: async ({ params }) => params.actor.listLicenses([params.options]),
    defaultValue: EMPTY_PAGE,
  });
  protected readonly _ownerQueryParam = injectQueryParams('owner', {
    parse: (value) => this._parseOwnerQueryParam(value),
  });
  protected readonly _rows = computed(() => this._licenses.value().data);
  protected readonly _total = computed(() => {
    const total = this._licenses.value().total;
    return total.length ? Number(total[0]) : this._rows().length;
  });
  protected readonly _pageCount = computed(() =>
    Math.max(1, Math.ceil(this._total() / this._pageSize())),
  );
  protected readonly _pageSizes = [10, 20, 50, 100];
  protected readonly _rangeEnd = computed(() =>
    Math.min(this._total(), (this._pageIndex() + 1) * this._pageSize()),
  );
  protected readonly _rangeStart = computed(() =>
    this._total() === 0 ? 0 : this._pageIndex() * this._pageSize() + 1,
  );
  protected readonly _sortDirection = signal<SortDirectionName>('desc');
  protected readonly _visibleColumns = computed(() =>
    this._visibleColumnDefs(this._columns),
  );
  protected readonly _table = createAngularTable<License>(() => ({
    data: this._rows(),
    columns: this._visibleColumns(),
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: 'onChange',
    manualPagination: true,
    pageCount: this._pageCount(),
    onColumnSizingChange: (updater) => this._setColumnSizing(updater),
    state: {
      columnSizing: this._columnSizing(),
    },
  }));
  readonly #location = inject(Location);

  constructor() {
    effect(() => {
      const owner = this._ownerQueryParam();

      untracked(() => this._applyOwnerQueryValue(owner));
    });
  }

  protected _badgeVariant(
    value: string,
  ): 'default' | 'destructive' | 'outline' | 'secondary' {
    if (value === 'completed') return 'default';
    if (value === 'refunded') return 'destructive';
    return 'secondary';
  }

  protected _columnVisible(columnId: ColumnId): boolean {
    return !this._hiddenColumns().has(columnId);
  }

  protected _date(value: bigint): Date {
    return timeInNanosToDate(value);
  }

  protected _formatAmount(license: License): string {
    const tokenId = license.receipt.tokenId;
    if ('ICP' in tokenId) return `${formatICP(license.receipt.amount)} ICP`;
    return `${license.receipt.amount.toString()} ${this._tokenLabel(tokenId)}`;
  }

  protected _nextPage(): void {
    this._pageIndex.update((pageIndex) =>
      Math.min(this._pageCount() - 1, pageIndex + 1),
    );
  }

  protected _previousPage(): void {
    this._pageIndex.update((pageIndex) => Math.max(0, pageIndex - 1));
  }

  protected _refundDate(license: License): Date | null {
    const status = license.receipt.status;
    return 'refunded' in status ? this._date(status.refunded.at) : null;
  }

  protected _refundLabel(license: License): string {
    const status = license.receipt.status;
    if (!('refunded' in status)) return '';

    const block = status.refunded.blockIndex[0];
    const suffix = block == null ? '' : ` · block ${block.toString()}`;
    return `${status.refunded.reason}${suffix}`;
  }

  protected _reload(): void {
    this._licenses.reload();
  }

  protected _setColumnSizing(updater: Updater<ColumnSizingState>): void {
    this._columnSizing.update((state) => functionalUpdate(updater, state));
  }

  protected _setFilters(filters: RbthFiltersState): void {
    this._filters.set(filters);
    this._pageIndex.set(0);
    this._syncFilterQueryParams(filters);
  }

  protected _setPageSize(value: number | null): void {
    if (!value) return;
    this._pageSize.set(value);
    this._pageIndex.set(0);
  }

  protected _sortable(columnId: string): boolean {
    return this._sortFieldForColumn(columnId) != null;
  }

  protected _sortIcon(columnId: string): string {
    if (this._sortField() !== this._sortFieldForColumn(columnId)) {
      return 'lucideArrowUpDown';
    }
    return this._sortDirection() === 'asc'
      ? 'lucideArrowUp'
      : 'lucideArrowDown';
  }

  protected _toggleColumn(columnId: ColumnId): void {
    const option = this._columnOptions.find((item) => item.id === columnId);
    if (option?.required) return;

    const next = new Set(this._hiddenColumns());
    if (next.has(columnId)) {
      next.delete(columnId);
    } else {
      next.add(columnId);
    }
    this._hiddenColumns.set(next);
  }

  protected _toggleSort(columnId: string): void {
    const sortField = this._sortFieldForColumn(columnId);
    if (!sortField) return;

    if (this._sortField() === sortField) {
      this._sortDirection.update((direction) =>
        direction === 'asc' ? 'desc' : 'asc',
      );
    } else {
      this._sortField.set(sortField);
      this._sortDirection.set('desc');
    }
    this._pageIndex.set(0);
  }

  protected _userTargets(values: ReadonlyArray<unknown>): UserTarget[] {
    return values.filter((value): value is UserTarget =>
      this._isUserTarget(value),
    );
  }

  protected _userTargetSummary(targets: ReadonlyArray<UserTarget>): string {
    if (!targets.length) return 'Search owner';
    if (targets.length === 1) return targets[0].label;
    return `${targets.length} selected`;
  }

  private _applyOwnerQueryValue(owner: string | null): void {
    const currentFilters = this._filters();
    if (owner == null) {
      if (this._ownerFilterValue(currentFilters) == null) return;

      this._setFilters(
        currentFilters.filter((filter) => filter.columnId !== 'owner'),
      );
      return;
    }

    if (this._ownerFilterValue(currentFilters) === owner) return;

    this._setFilters([
      ...currentFilters.filter((filter) => filter.columnId !== 'owner'),
      {
        columnId: 'owner',
        operator: 'isAnyOf',
        type: 'custom',
        values: [
          {
            kind: 'principal',
            label: owner,
            principalId: owner,
          },
        ],
      },
    ]);
  }

  private _booleanFilter(columnId: string): [] | [boolean] {
    const filter = this._filters().find(
      (item): item is RbthBooleanFilterModel =>
        item.columnId === columnId && item.type === 'boolean',
    );
    if (!filter || filter.values[0] === undefined) return [];
    return [filter.operator === 'isNot' ? !filter.values[0] : filter.values[0]];
  }

  private _currentOwnerQueryValue(): string | null {
    const [, query = ''] = this.#location.path().split('?');
    return this._parseOwnerQueryParam(new URLSearchParams(query).get('owner'));
  }

  private _dateFilter(
    field: DateField,
  ): [] | [{ max: [] | [bigint]; min: [] | [bigint] }] {
    const filter = this._dateFilterModel(field);
    if (!filter || !filter.values.length) return [];

    switch (filter.operator) {
      case 'after': {
        const value = filter.values[0];
        return value
          ? [{ min: [this._endOfDayNanos(value) + 1n], max: [] }]
          : [];
      }
      case 'before': {
        const value = filter.values[0];
        return value
          ? [{ min: [], max: [this._startOfDayNanos(value) - 1n] }]
          : [];
      }
      case 'between': {
        const [start, end] = filter.values;
        return start && end
          ? [{ min: [this._startOfDayNanos(start)], max: [this._endOfDayNanos(end)] }]
          : [];
      }
      case 'notBetween':
      case 'notOn':
        return [];
      case 'on': {
        const value = filter.values[0];
        return value
          ? [{ min: [this._startOfDayNanos(value)], max: [this._endOfDayNanos(value)] }]
          : [];
      }
      case 'onOrAfter': {
        const value = filter.values[0];
        return value ? [{ min: [this._startOfDayNanos(value)], max: [] }] : [];
      }
      case 'onOrBefore': {
        const value = filter.values[0];
        return value ? [{ min: [], max: [this._endOfDayNanos(value)] }] : [];
      }
    }
  }

  private _dateFilterModel(field: DateField): RbthDateFilterModel | undefined {
    return this._filters().find(
      (filter): filter is RbthDateFilterModel =>
        filter.columnId === field && filter.type === 'date',
    );
  }

  private _endOfDayNanos(date: Date): bigint {
    return BigInt(endOfDay(date).getTime()) * 1_000_000n;
  }

  private _isColumnId(columnId: string): columnId is ColumnId {
    return this._columnOptions.some((column) => column.id === columnId);
  }

  private _isUserTarget(value: unknown): value is UserTarget {
    if (typeof value !== 'object' || value === null) return false;
    if (!('kind' in value) || !('label' in value)) return false;

    return (
      (value.kind === 'email' && 'email' in value) ||
      ((value.kind === 'principal' || value.kind === 'user') &&
        'principalId' in value)
    );
  }

  private _multiOptionFilter(columnId: string): [] | [string[]] {
    const filter = this._filters().find(
      (item): item is RbthMultiOptionFilterModel =>
        item.columnId === columnId && item.type === 'multiOption',
    );
    if (!filter || !filter.values.length) return [];
    if (filter.operator !== 'include' && filter.operator !== 'includeAnyOf') {
      return [];
    }
    return [filter.values];
  }

  private _ownerFilter(): [] | [Principal[]] {
    const filter = this._filters().find(
      (item) => item.columnId === 'owner' && item.type === 'custom',
    );
    if (!filter) return [];

    const principals = this._userTargets(filter.values)
      .filter((target) => target.kind !== 'email')
      .map((target) => target.principalId)
      .map((principalId) => Principal.fromText(principalId));

    return principals.length ? [principals] : [];
  }

  private _ownerFilterValue(filters: RbthFiltersState): string | null {
    const filter = filters.find(
      (item) => item.columnId === 'owner' && item.type === 'custom',
    );
    if (!filter) return null;

    const principalTargets = this._userTargets(filter.values).filter(
      (target) => target.kind !== 'email',
    );
    return principalTargets.length === 1 ? principalTargets[0].principalId : null;
  }

  private _parseOwnerQueryParam(value: string | null): string | null {
    if (!value) return null;

    try {
      Principal.fromText(value);
      return value;
    } catch {
      return null;
    }
  }

  private _paymentIdFilter(): [] | [string] {
    const filter = this._filters().find(
      (item): item is RbthTextFilterModel =>
        item.columnId === 'paymentId' && item.type === 'text',
    );
    const value = filter?.values[0]?.trim();
    return filter?.operator === 'contains' && value ? [value] : [];
  }

  private _principalFilter(columnId: string): [] | [Principal[]] {
    const filter = this._filters().find(
      (item): item is RbthPrincipalFilterModel =>
        item.columnId === columnId && item.type === 'principal',
    );
    if (!filter || !filter.values.length) return [];
    if (filter.operator !== 'is' && filter.operator !== 'isAnyOf') return [];

    const principals = filter.values.flatMap((value) => {
      try {
        return [Principal.fromText(value)];
      } catch {
        return [];
      }
    });

    return principals.length ? [principals] : [];
  }

  private _sortDirectionValue(): SortDirection {
    return this._sortDirection() === 'asc'
      ? { Ascending: null }
      : { Descending: null };
  }

  private _sortFieldForColumn(columnId: string): string | null {
    switch (columnId) {
      case 'createdAt':
        return 'createdAt';
      case 'paidAt':
        return 'receipt.paidAt';
      case 'paymentId':
        return 'receipt.paymentId';
      case 'status':
        return 'statusTag';
      default:
        return null;
    }
  }

  private _startOfDayNanos(date: Date): bigint {
    return BigInt(startOfDay(date).getTime()) * 1_000_000n;
  }

  private _syncFilterQueryParams(filters: RbthFiltersState): void {
    const owner = this._ownerFilterValue(filters);
    if (this._currentOwnerQueryValue() === owner) return;

    const [path, query = ''] = this.#location.path().split('?');
    const queryParams = new URLSearchParams(query);
    if (owner == null) {
      queryParams.delete('owner');
    } else {
      queryParams.set('owner', owner);
    }

    const nextQuery = queryParams.toString();
    this.#location.replaceState(nextQuery ? `${path}?${nextQuery}` : path);
  }

  private _tokenLabel(tokenId: TokenId): string {
    if ('ICP' in tokenId) return 'ICP';
    if ('ETH' in tokenId) return 'ETH';
    if ('SOL' in tokenId) return 'SOL';
    if ('ckUSDC' in tokenId) return 'ckUSDC';
    return 'ckUSDT';
  }

  private _visibleColumnDefs(
    columns: ReadonlyArray<ColumnDef<License>>,
  ): ColumnDef<License>[] {
    const hidden = this._hiddenColumns();

    return columns.flatMap((column) =>
      typeof column.id === 'string' &&
      this._isColumnId(column.id) &&
      hidden.has(column.id)
        ? []
        : [column],
    );
  }
}
