import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  resource,
  signal,
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
  lucideEllipsis,
  lucidePause,
  lucidePlay,
  lucideRefreshCw,
  lucideRotateCcw,
  lucideServerCog,
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
import { toast } from 'ngx-sonner';

import {
  CopyToClipboardComponent,
  injectMainActor,
  timeInNanosToDate,
  UserTarget,
  UserTargetComboboxComponent,
  UserTargetComboboxValueDirective,
} from '@rabbithole/core';
import {
  CreationListItem,
  GetCreationsResponse,
  ListCreationsOptions,
  SortDirection,
} from '@rabbithole/declarations/backend';
import {
  RbthBooleanFilterModel,
  RbthDataTableFilterComponent,
  RbthDateFilterModel,
  rbthFilterColumn,
  RbthFiltersState,
  RbthFilterValueDirective,
  RbthMultiOptionFilterModel,
  RbthNumberFilterModel,
  RbthPrincipalFilterModel,
  RbthTextFilterModel,
} from '@rabbithole/ui/data-table-filter';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { AdminCreationStatusPopoverComponent } from './admin-creation-status-popover.component';

type ColumnId =
  | 'actions'
  | 'ambassadorPayoutStatus'
  | 'canisterId'
  | 'completedAt'
  | 'createdAt'
  | 'id'
  | 'licensePaymentId'
  | 'operation'
  | 'owner'
  | 'release'
  | 'status'
  | 'subnetId';
type CreationSortField =
  | 'ambassadorPayoutStatusTag'
  | 'completedAt'
  | 'createdAt'
  | 'id'
  | 'releaseTag'
  | 'statusTag';
type DateField = 'completedAt' | 'createdAt';
type RecoveryStrategyName = 'refund' | 'resume';
type SortDirectionName = 'asc' | 'desc';

const EMPTY_PAGE: GetCreationsResponse = {
  data: [],
  instructions: 0n,
  total: [],
};

const STATUS_OPTIONS = [
  { label: 'Payment starting', value: 'ProcessingPayment.Starting' },
  { label: 'Fetching rates', value: 'ProcessingPayment.FetchingRates' },
  { label: 'Checking balances', value: 'ProcessingPayment.CheckingBalances' },
  { label: 'Charging', value: 'ProcessingPayment.Charging' },
  { label: 'Recording license', value: 'ProcessingPayment.RecordingLicense' },
  { label: 'Activating', value: 'ProcessingPayment.Activating' },
  { label: 'Queueing payment', value: 'ProcessingPayment.Queueing' },
  { label: 'Pending', value: 'Pending' },
  { label: 'Checking balance', value: 'CheckingBalance' },
  { label: 'Transferring ICP', value: 'TransferringICP' },
  { label: 'Notifying CMC', value: 'NotifyingCMC' },
  { label: 'Canister created', value: 'CanisterCreated' },
  { label: 'Installing WASM', value: 'InstallingWasm' },
  { label: 'Uploading frontend', value: 'UploadingFrontend' },
  { label: 'Revoking installer', value: 'RevokingInstallerPermission' },
  { label: 'Updating controllers', value: 'UpdatingControllers' },
  { label: 'Upgrading WASM', value: 'UpgradingWasm' },
  { label: 'Upgrading frontend', value: 'UpgradingFrontend' },
  { label: 'Completed', value: 'Completed' },
  { label: 'Failed', value: 'Failed' },
];

@Component({
  selector: 'app-admin-creations',
  imports: [
    DatePipe,
    NgIcon,
    AdminCreationStatusPopoverComponent,
    CopyToClipboardComponent,
    HlmBadge,
    HlmIcon,
    HlmSpinner,
    RbthDataTableFilterComponent,
    RbthFilterValueDirective,
    UserTargetComboboxComponent,
    UserTargetComboboxValueDirective,
    ...HlmButtonImports,
    ...HlmDropdownMenuImports,
    ...HlmTableImports,
    ...HlmTooltipImports,
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
      lucideEllipsis,
      lucidePause,
      lucidePlay,
      lucideRefreshCw,
      lucideRotateCcw,
      lucideServerCog,
    }),
  ],
  templateUrl: './admin-creations.component.html',
  host: {
    class: 'flex min-w-0 w-full flex-col gap-6',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCreationsComponent {
  protected readonly _actionInFlight = signal<string | null>(null);

  protected readonly _columnOptions: Array<{
    id: ColumnId;
    label: string;
    required?: boolean;
  }> = [
    { id: 'canisterId', label: 'Canister' },
    { id: 'owner', label: 'Owner' },
    { id: 'operation', label: 'Operation' },
    { id: 'status', label: 'Status', required: true },
    { id: 'release', label: 'Release' },
    { id: 'ambassadorPayoutStatus', label: 'Payout' },
    { id: 'licensePaymentId', label: 'License' },
    { id: 'subnetId', label: 'Subnet' },
    { id: 'createdAt', label: 'Created' },
    { id: 'completedAt', label: 'Completed' },
    { id: 'id', label: 'ID' },
    { id: 'actions', label: 'Actions', required: true },
  ];

  protected readonly _columns: ColumnDef<CreationListItem>[] = [
    { id: 'canisterId', header: 'Canister', minSize: 200, size: 240 },
    { id: 'owner', header: 'Owner', minSize: 260, size: 340 },
    { id: 'operation', header: 'Operation', minSize: 112, size: 128 },
    { id: 'status', header: 'Status', minSize: 220, size: 280 },
    { id: 'release', header: 'Release', minSize: 180, size: 220 },
    {
      id: 'ambassadorPayoutStatus',
      header: 'Payout',
      minSize: 120,
      size: 140,
    },
    { id: 'licensePaymentId', header: 'License', minSize: 180, size: 220 },
    { id: 'subnetId', header: 'Subnet', minSize: 260, size: 340 },
    { id: 'createdAt', header: 'Created', minSize: 180, size: 210 },
    { id: 'completedAt', header: 'Completed', minSize: 180, size: 210 },
    { id: 'id', header: 'ID', minSize: 72, size: 84 },
    { id: 'actions', header: '', minSize: 64, size: 72 },
  ];

  protected readonly _columnSizing = signal<ColumnSizingState>({});
  protected readonly _pageIndex = signal(0);
  protected readonly _pageSize = signal(20);
  protected readonly _sortField = signal<CreationSortField>('createdAt');
  protected readonly _options = computed<ListCreationsOptions>(() => ({
    pagination: {
      offset: BigInt(this._pageIndex() * this._pageSize()),
      limit: BigInt(this._pageSize()),
    },
    count: true,
    sort: [[this._sortField(), this._sortDirectionValue()]],
    filter: {
      id: this._idFilter(),
      owner: this._ownerFilter(),
      canisterId: this._principalFilter('canisterId'),
      statusTag: this._multiOptionFilter('statusTag'),
      releaseTag: this._releaseTagFilter(),
      hasCanister: this._booleanFilter('hasCanister'),
      hasLicense: this._booleanFilter('hasLicense'),
      createdAt: this._dateFilter('createdAt'),
      completedAt: this._dateFilter('completedAt'),
      ambassadorPayoutStatus: this._multiOptionFilter(
        'ambassadorPayoutStatus',
      ),
    },
  }));
  readonly #actor = injectMainActor();
  protected readonly _creations = resource({
    params: () => ({
      actor: this.#actor(),
      options: this._options(),
    }),
    loader: async ({ params }) => params.actor.listCreations([params.options]),
    defaultValue: EMPTY_PAGE,
  });
  protected readonly _debugCreations = effect(() => {
    const raw = this._creations.value().data;
    const normalized = raw.map((record) =>
      this._normalizeCreationForDebug(record),
    );

    console.groupCollapsed(`[Admin Creations] table rows: ${raw.length}`);
    console.log('raw', raw);
    console.log('normalized', normalized);
    console.groupEnd();
  });
  protected readonly _deployerRunning = resource({
    params: () => this.#actor(),
    loader: async ({ params }) => params.isStorageDeployerRunning(),
    defaultValue: false,
  });
  protected readonly _filterColumns = [
    rbthFilterColumn.number<CreationListItem>({
      id: 'id',
      label: 'ID',
      min: 0,
      operators: ['equals'],
    }),
    rbthFilterColumn.custom<CreationListItem>({
      id: 'owner',
      label: 'Owner',
      operators: ['isAnyOf'],
    }),
    rbthFilterColumn.principal<CreationListItem>({
      id: 'canisterId',
      label: 'Canister',
      operators: ['is', 'isAnyOf'],
    }),
    rbthFilterColumn.multiOption<CreationListItem>({
      id: 'statusTag',
      label: 'Status',
      operators: ['include', 'includeAnyOf'],
      options: STATUS_OPTIONS,
    }),
    rbthFilterColumn.text<CreationListItem>({
      id: 'releaseTag',
      label: 'Release',
      operators: ['contains'],
    }),
    rbthFilterColumn.boolean<CreationListItem>({
      falseLabel: 'Missing',
      id: 'hasCanister',
      label: 'Canister',
      operators: ['is'],
      trueLabel: 'Created',
    }),
    rbthFilterColumn.boolean<CreationListItem>({
      falseLabel: 'Missing',
      id: 'hasLicense',
      label: 'License',
      operators: ['is'],
      trueLabel: 'Present',
    }),
    rbthFilterColumn.date<CreationListItem>({
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
    rbthFilterColumn.date<CreationListItem>({
      id: 'completedAt',
      label: 'Completed',
      operators: [
        'on',
        'before',
        'onOrBefore',
        'after',
        'onOrAfter',
        'between',
      ],
    }),
    rbthFilterColumn.multiOption<CreationListItem>({
      id: 'ambassadorPayoutStatus',
      label: 'Payout',
      operators: ['include', 'includeAnyOf'],
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Completed', value: 'completed' },
        { label: 'Failed', value: 'failed' },
        { label: 'Skipped', value: 'skipped' },
      ],
    }),
  ];
  protected readonly _filters = signal<RbthFiltersState>([]);
  protected readonly _hiddenColumns = signal<Set<ColumnId>>(
    new Set<ColumnId>(['completedAt', 'id', 'licensePaymentId', 'subnetId']),
  );
  protected readonly _rows = computed(() => this._creations.value().data);
  protected readonly _total = computed(() => {
    const total = this._creations.value().total;
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
  protected readonly _table = createAngularTable<CreationListItem>(() => ({
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

  protected _actionDisabled(record: CreationListItem): boolean {
    return this._actionInFlight()?.startsWith(`${record.id}:`) ?? false;
  }

  protected _badgeVariant(
    value: string,
  ): 'default' | 'destructive' | 'outline' | 'secondary' {
    if (value === 'Failed' || value === 'failed') return 'destructive';
    if (value === 'Completed' || value === 'completed') return 'default';
    if (value === 'skipped') return 'outline';
    return 'secondary';
  }

  protected _canRecoverStuck(record: CreationListItem): boolean {
    return record.statusTag !== 'Completed' && record.statusTag !== 'Failed';
  }

  protected _canRefund(record: CreationListItem): boolean {
    return (
      record.statusTag === 'Failed' &&
      !record.canisterId[0] &&
      record.licensePaymentId.length > 0
    );
  }

  protected _canResume(record: CreationListItem): boolean {
    return record.statusTag === 'Failed';
  }

  protected _canRetryPayout(record: CreationListItem): boolean {
    return record.ambassadorPayoutStatusTag === 'failed';
  }

  protected _columnVisible(columnId: ColumnId): boolean {
    return !this._hiddenColumns().has(columnId);
  }

  protected _date(value: bigint): Date {
    return timeInNanosToDate(value);
  }

  protected _hasActions(record: CreationListItem): boolean {
    return (
      this._canResume(record) ||
      this._canRecoverStuck(record) ||
      this._canRetryPayout(record) ||
      this._canRefund(record)
    );
  }

  protected _nextPage(): void {
    this._pageIndex.update((pageIndex) =>
      Math.min(this._pageCount() - 1, pageIndex + 1),
    );
  }

  protected _operationDescription(record: CreationListItem): string {
    if (!record.isUpgrade) return 'New storage';
    return record.upgradeIncludesFrontend ? 'WASM + frontend' : 'WASM only';
  }

  protected _operationLabel(record: CreationListItem): string {
    return record.isUpgrade ? 'Upgrade' : 'Creation';
  }

  protected _optionalDate(value: [] | [bigint]): Date | null {
    return value[0] ? this._date(value[0]) : null;
  }

  protected _previousPage(): void {
    this._pageIndex.update((pageIndex) => Math.max(0, pageIndex - 1));
  }

  protected _principalText(value: [] | [Principal]): string {
    return value[0]?.toText() ?? '';
  }

  protected async _recoverFailed(
    record: CreationListItem,
    strategy: RecoveryStrategyName,
  ): Promise<void> {
    if (strategy === 'refund') {
      const confirmed = window.confirm(
        `Refund creation #${record.id.toString()}? This cannot recover cycles after canister creation.`,
      );
      if (!confirmed) return;
    }

    await this._runResultAction(
      record,
      strategy,
      () => {
        const recoveryStrategy =
          strategy === 'resume' ? { resume: null } : { refund: null };
        return this.#actor().recoverFailedStorage(record.id, recoveryStrategy);
      },
      strategy === 'resume' ? 'Recovery scheduled' : 'Refund scheduled',
    );
  }

  protected async _recoverStuck(record: CreationListItem): Promise<void> {
    await this._runResultAction(
      record,
      'recover-stuck',
      () => this.#actor().recoverStuckCreation(record.id),
      'Stuck creation recovery scheduled',
    );
  }

  protected _reload(): void {
    this._creations.reload();
    this._deployerRunning.reload();
  }

  protected _reloadCreations(): void {
    this._creations.reload();
  }

  protected async _retryPayout(record: CreationListItem): Promise<void> {
    await this._runResultAction(
      record,
      'retry-payout',
      () => this.#actor().retryAmbassadorPayout(record.id),
      'Ambassador payout retry scheduled',
    );
  }

  protected _setColumnSizing(updater: Updater<ColumnSizingState>): void {
    this._columnSizing.update((state) => functionalUpdate(updater, state));
  }

  protected _setFilters(filters: RbthFiltersState): void {
    this._filters.set(filters);
    this._pageIndex.set(0);
  }

  protected _setPageSize(value: number | null): void {
    if (!value) return;
    this._pageSize.set(value);
    this._pageIndex.set(0);
  }

  protected _shortPrincipal(principalId: string): string {
    return principalId.length > 20
      ? `${principalId.slice(0, 8)}...${principalId.slice(-7)}`
      : principalId;
  }

  protected _sortable(columnId: string): boolean {
    return this._creationSortField(columnId) != null;
  }

  protected _sortIcon(columnId: string): string {
    if (this._sortField() !== columnId) return 'lucideArrowUpDown';
    return this._sortDirection() === 'asc'
      ? 'lucideArrowUp'
      : 'lucideArrowDown';
  }

  protected async _stopOrStartDeployer(): Promise<void> {
    const shouldStart = !this._deployerRunning.value();
    const actionId = shouldStart ? 'deployer:start' : 'deployer:stop';
    this._actionInFlight.set(actionId);
    try {
      if (shouldStart) {
        await this.#actor().startStorageDeployer();
        toast.success('Storage deployer started');
      } else {
        await this.#actor().stopStorageDeployer();
        toast.success('Storage deployer stopped');
      }
      this._deployerRunning.reload();
    } catch (error) {
      console.error('Failed to toggle storage deployer', error);
      toast.error('Failed to update storage deployer');
    } finally {
      this._actionInFlight.set(null);
    }
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
    const sortField = this._creationSortField(columnId);
    if (!sortField) return;

    if (this._sortField() === columnId) {
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

  private _booleanFilter(columnId: string): [] | [boolean] {
    const filter = this._filters().find(
      (item): item is RbthBooleanFilterModel =>
        item.columnId === columnId && item.type === 'boolean',
    );
    if (!filter || filter.values[0] === undefined) return [];
    return [filter.operator === 'isNot' ? !filter.values[0] : filter.values[0]];
  }

  private _creationSortField(columnId: string): CreationSortField | null {
    switch (columnId) {
      case 'ambassadorPayoutStatus':
        return 'ambassadorPayoutStatusTag';
      case 'completedAt':
      case 'createdAt':
      case 'id':
        return columnId;
      case 'release':
        return 'releaseTag';
      case 'status':
        return 'statusTag';
      default:
        return null;
    }
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
          ? [
              {
                min: [this._startOfDayNanos(start)],
                max: [this._endOfDayNanos(end)],
              },
            ]
          : [];
      }
      case 'notBetween':
      case 'notOn':
        return [];
      case 'on': {
        const value = filter.values[0];
        return value
          ? [
              {
                min: [this._startOfDayNanos(value)],
                max: [this._endOfDayNanos(value)],
              },
            ]
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

  private _formatFixed(value: bigint, divisor: bigint, decimals: number): string {
    const whole = value / divisor;
    const fraction = value % divisor;
    const fractionText = fraction
      .toString()
      .padStart(divisor.toString().length - 1, '0')
      .slice(0, decimals)
      .replace(/0+$/, '');

    return fractionText ? `${whole}.${fractionText}` : whole.toString();
  }

  private _idFilter(): [] | [bigint[]] {
    const filter = this._filters().find(
      (item): item is RbthNumberFilterModel =>
        item.columnId === 'id' && item.type === 'number',
    );
    const value = filter?.values[0];
    if (
      filter?.operator !== 'equals' ||
      value == null ||
      !Number.isInteger(value) ||
      value < 0
    ) {
      return [];
    }
    return [[BigInt(value)]];
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

  private _normalizeCreationForDebug(record: CreationListItem) {
    const completedAt = this._optionalDate(record.completedAt);

    return {
      id: record.id.toString(),
      owner: record.owner.toText(),
      statusTag: record.statusTag,
      status: this._normalizeStatusForDebug(record.status),
      operation: this._operationLabel(record),
      operationDescription: this._operationDescription(record),
      releaseTag: record.releaseTag,
      installedReleaseTag: record.installedReleaseTag[0] ?? null,
      canisterId: this._principalText(record.canisterId) || null,
      subnetId: this._principalText(record.subnetId) || null,
      licensePaymentId: record.licensePaymentId[0] ?? null,
      ambassadorPayoutStatusTag: record.ambassadorPayoutStatusTag,
      createdAt: this._date(record.createdAt).toISOString(),
      completedAt: completedAt?.toISOString() ?? null,
      lastEventAt:
        this._optionalDate(record.lastEventAt)?.toISOString() ?? null,
      isUpgrade: record.isUpgrade,
      upgradeIncludesFrontend: record.upgradeIncludesFrontend,
      hasEvents: record.hasEvents,
      hasFrontendInstallDiagnostics: record.hasFrontendInstallDiagnostics,
    };
  }

  private _normalizeDebugValue(value: unknown): unknown {
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Principal) return value.toText();
    if (value instanceof Uint8Array) return Array.from(value);
    if (Array.isArray(value)) {
      return value.map((item) => this._normalizeDebugValue(item));
    }
    if (typeof value === 'object' && value !== null) {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          this._normalizeDebugValue(item),
        ]),
      );
    }
    return value;
  }

  private _normalizeStatusForDebug(status: unknown) {
    if (typeof status !== 'object' || status === null) {
      return { tag: 'unknown', value: this._normalizeDebugValue(status) };
    }
    const [[tag, value]] = Object.entries(status);

    return {
      tag,
      value: this._normalizeDebugValue(value),
    };
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

  private _releaseTagFilter(): [] | [string] {
    const filter = this._filters().find(
      (item): item is RbthTextFilterModel =>
        item.columnId === 'releaseTag' && item.type === 'text',
    );
    const value = filter?.values[0]?.trim();
    return filter?.operator === 'contains' && value ? [value] : [];
  }

  private async _runResultAction(
    record: CreationListItem,
    action: string,
    operation: () => Promise<{ err: string } | { ok: null }>,
    successMessage: string,
  ): Promise<void> {
    const actionId = `${record.id}:${action}`;
    this._actionInFlight.set(actionId);

    try {
      const result = await operation();
      if ('err' in result) {
        toast.error(result.err);
        return;
      }
      toast.success(successMessage);
      this._creations.reload();
    } catch (error) {
      console.error(`Failed to run creation action ${action}`, error);
      toast.error('Creation action failed');
    } finally {
      this._actionInFlight.set(null);
    }
  }

  private _sortDirectionValue(): SortDirection {
    return this._sortDirection() === 'asc'
      ? { Ascending: null }
      : { Descending: null };
  }

  private _startOfDayNanos(date: Date): bigint {
    return BigInt(startOfDay(date).getTime()) * 1_000_000n;
  }

  private _visibleColumnDefs(
    columns: ReadonlyArray<ColumnDef<CreationListItem>>,
  ): ColumnDef<CreationListItem>[] {
    const hidden = this._hiddenColumns();

    return columns.flatMap((column) => {
      if ('columns' in column && Array.isArray(column.columns)) {
        const childColumns = this._visibleColumnDefs(column.columns);
        return childColumns.length
          ? [{ ...column, columns: childColumns }]
          : [];
      }

      return typeof column.id === 'string' &&
        this._isColumnId(column.id) &&
        hidden.has(column.id)
        ? []
        : [column];
    });
  }
}
