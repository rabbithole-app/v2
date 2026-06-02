import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
  lucideRefreshCw,
  lucideRotateCcw,
  lucideTimerReset,
  lucideUserPlus,
} from '@ng-icons/lucide';
import {
  BrnAlertDialogContent,
  BrnAlertDialogTrigger,
} from '@spartan-ng/brain/alert-dialog';
import type { BrnDialogState } from '@spartan-ng/brain/dialog';
import { toast } from '@spartan-ng/brain/sonner';
import {
  ColumnDef,
  ColumnSizingState,
  createAngularTable,
  functionalUpdate,
  getCoreRowModel,
  Updater,
} from '@tanstack/angular-table';
import { endOfDay, startOfDay } from 'date-fns';

import {
  formatBytes,
  injectMainActor,
  PageHeaderActionsDirective,
  timeInNanosToDate,
  UserTarget,
  UserTargetComboboxComponent,
  UserTargetComboboxValueDirective,
} from '@rabbithole/core';
import {
  GetSubscriptionsResponse,
  Plan,
  SortDirection,
  Status,
  Subscription,
  SubscriptionListOptions,
} from '@rabbithole/declarations/backend';
import { CopyToClipboardComponent } from '@rabbithole/ui/copy-to-clipboard';
import {
  RbthDataTableFilterComponent,
  RbthDateFilterModel,
  rbthFilterColumn,
  RbthFiltersState,
  RbthFilterValueDirective,
  RbthMultiOptionFilterModel,
} from '@rabbithole/ui/data-table-filter';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmButtonGroupImports } from '@spartan-ng/helm/button-group';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { HlmTableImports } from '@spartan-ng/helm/table';

type ColumnId =
  | 'actions'
  | 'activatedAt'
  | 'createdAt'
  | 'expiresAt'
  | 'plan'
  | 'status'
  | 'updatedAt'
  | 'user';
type DateField = 'activatedAt' | 'createdAt' | 'expiresAt' | 'updatedAt';
type SortDirectionName = 'asc' | 'desc';
type SubscriptionDialogMode = 'activate' | 'renew';

const EMPTY_PAGE: GetSubscriptionsResponse = {
  data: [],
  instructions: 0n,
  total: [],
};

@Component({
  selector: 'app-admin-subscriptions',
  imports: [
    BrnAlertDialogContent,
    BrnAlertDialogTrigger,
    CopyToClipboardComponent,
    DatePipe,
    HlmBadge,
    HlmInput,
    HlmIcon,
    PageHeaderActionsDirective,
    HlmSpinner,
    NgIcon,
    RbthDataTableFilterComponent,
    RbthFilterValueDirective,
    UserTargetComboboxComponent,
    UserTargetComboboxValueDirective,
    ...HlmAlertDialogImports,
    ...HlmButtonGroupImports,
    ...HlmButtonImports,
    ...HlmDialogImports,
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
      lucideEllipsis,
      lucideRefreshCw,
      lucideRotateCcw,
      lucideTimerReset,
      lucideUserPlus,
    }),
  ],
  templateUrl: './admin-subscriptions.component.html',
  host: {
    class: 'flex min-w-0 w-full flex-col gap-6',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSubscriptionsComponent {
  protected readonly _actionInFlight = signal<string | null>(null);
  protected readonly _columnOptions: Array<{
    id: ColumnId;
    label: string;
    required?: boolean;
  }> = [
    { id: 'user', label: 'User', required: true },
    { id: 'plan', label: 'Plan' },
    { id: 'status', label: 'Status' },
    { id: 'expiresAt', label: 'Expires' },
    { id: 'activatedAt', label: 'Activated' },
    { id: 'updatedAt', label: 'Updated' },
    { id: 'createdAt', label: 'Created' },
    { id: 'actions', label: 'Actions', required: true },
  ];
  protected readonly _columns: ColumnDef<Subscription>[] = [
    { id: 'user', header: 'User', minSize: 260, size: 340 },
    { id: 'plan', header: 'Plan', minSize: 96, size: 120 },
    { id: 'status', header: 'Status', minSize: 110, size: 130 },
    { id: 'expiresAt', header: 'Expires', minSize: 180, size: 220 },
    { id: 'activatedAt', header: 'Activated', minSize: 180, size: 210 },
    { id: 'updatedAt', header: 'Updated', minSize: 180, size: 210 },
    { id: 'createdAt', header: 'Created', minSize: 180, size: 210 },
    { id: 'actions', header: '', minSize: 64, size: 72 },
  ];
  protected readonly _columnSizing = signal<ColumnSizingState>({});
  protected readonly _dialogDays = signal('30');
  protected readonly _dialogMode = signal<SubscriptionDialogMode>('renew');
  protected readonly _dialogPlan = signal<'Pro'>('Pro');
  protected readonly _dialogState = signal<BrnDialogState>('closed');
  protected readonly _dialogSubscription = signal<Subscription | null>(null);
  protected readonly _dialogTargets = signal<UserTarget[]>([]);
  protected readonly _filterColumns = [
    rbthFilterColumn.custom<Subscription>({
      id: 'user',
      label: 'User',
      operators: ['isAnyOf'],
    }),
    rbthFilterColumn.multiOption<Subscription>({
      id: 'plan',
      label: 'Plan',
      operators: ['include', 'includeAnyOf'],
      options: [
        { label: 'Free', value: 'Free' },
        { label: 'Pro', value: 'Pro' },
      ],
    }),
    rbthFilterColumn.multiOption<Subscription>({
      id: 'status',
      label: 'Status',
      operators: ['include', 'includeAnyOf'],
      options: [
        { label: 'Active', value: 'Active' },
        { label: 'Expired', value: 'Expired' },
        { label: 'Cancelled', value: 'Cancelled' },
      ],
    }),
    rbthFilterColumn.date<Subscription>({
      id: 'expiresAt',
      label: 'Expires',
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
    new Set<ColumnId>(['createdAt']),
  );
  protected readonly _pageIndex = signal(0);
  protected readonly _pageSize = signal(20);
  protected readonly _sortField = signal<DateField>('updatedAt');
  protected readonly _options = computed<SubscriptionListOptions>(() => ({
    pagination: {
      offset: BigInt(this._pageIndex() * this._pageSize()),
      limit: BigInt(this._pageSize()),
    },
    count: true,
    sort: [[this._sortField(), this._sortDirectionValue()]],
    filter: {
      userId: this._userFilter(),
      plan: this._planFilter(),
      status: this._statusFilter(),
      expiresAt: this._dateFilter('expiresAt'),
    },
  }));
  readonly #actor = injectMainActor();
  protected readonly _subscriptions = resource({
    params: () => ({
      actor: this.#actor(),
      options: this._options(),
    }),
    loader: async ({ params }) => params.actor.listSubscriptions(params.options),
    defaultValue: EMPTY_PAGE,
  });
  protected readonly _rows = computed(() => this._subscriptions.value().data);
  protected readonly _total = computed(() => {
    const total = this._subscriptions.value().total;
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
  protected readonly _table = createAngularTable<Subscription>(() => ({
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

  protected _actionDisabled(subscription: Subscription): boolean {
    return this._actionInFlight()?.startsWith(subscription.userId.toText()) ?? false;
  }

  protected _badgeVariant(
    value: string,
  ): 'default' | 'destructive' | 'outline' | 'secondary' {
    if (value === 'Active' || value === 'Pro') return 'default';
    if (value === 'Expired') return 'destructive';
    if (value === 'Cancelled' || value === 'Free') return 'outline';
    return 'secondary';
  }

  protected _columnVisible(columnId: ColumnId): boolean {
    return !this._hiddenColumns().has(columnId);
  }

  protected _date(value: bigint): Date {
    return timeInNanosToDate(value);
  }

  protected _formatBytes(value: bigint): string {
    return formatBytes(Number(value));
  }

  protected _nextPage(): void {
    this._pageIndex.update((pageIndex) =>
      Math.min(this._pageCount() - 1, pageIndex + 1),
    );
  }

  protected _openManualActivationDialog(): void {
    this._dialogSubscription.set(null);
    this._dialogTargets.set([]);
    this._dialogMode.set('activate');
    this._dialogPlan.set('Pro');
    this._dialogDays.set('30');
    this._dialogState.set('open');
  }

  protected _openSubscriptionDialog(
    subscription: Subscription,
    mode: SubscriptionDialogMode,
    planName: 'Pro',
  ): void {
    this._dialogSubscription.set(subscription);
    this._dialogTargets.set([]);
    this._dialogMode.set(mode);
    this._dialogPlan.set(planName);
    this._dialogDays.set('30');
    this._dialogState.set('open');
  }

  protected _optionalDate(value: [] | [bigint]): Date | null {
    return value[0] ? this._date(value[0]) : null;
  }

  protected _planLabel(plan: Plan): 'Free' | 'Pro' {
    if ('Pro' in plan) return 'Pro';
    return 'Free';
  }

  protected _previousPage(): void {
    this._pageIndex.update((pageIndex) => Math.max(0, pageIndex - 1));
  }

  protected _reload(): void {
    this._subscriptions.reload();
  }

  protected _setColumnSizing(updater: Updater<ColumnSizingState>): void {
    this._columnSizing.update((state) => functionalUpdate(updater, state));
  }

  protected _setDialogTargets(targets: UserTarget[]): void {
    this._dialogTargets.set(
      targets.filter((target) => target.kind !== 'email').slice(-1),
    );
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

  protected _statusLabel(status: Status): 'Active' | 'Cancelled' | 'Expired' {
    if ('Active' in status) return 'Active';
    if ('Cancelled' in status) return 'Cancelled';
    return 'Expired';
  }

  protected async _submitSubscriptionDialog(): Promise<void> {
    const subscription = this._dialogSubscription();
    const targetUserId = subscription?.userId ?? this._dialogTargetUserId();
    if (!targetUserId) {
      toast.error('Choose one user or principal');
      return;
    }

    const days = Number(this._dialogDays());
    if (!Number.isInteger(days) || days <= 0) {
      toast.error('Duration must be a positive number of days');
      return;
    }

    const mode = this._dialogMode();
    const planName = this._dialogPlan();
    await this._runSubscriptionAction(
      targetUserId,
      `${mode}-${planName}`,
      () =>
        mode === 'activate'
          ? this.#actor().activateSubscription(
              targetUserId,
              this._planFromName(planName),
              [this._expiresAtFromDays(days)],
            )
          : this.#actor().renewSubscription(
              targetUserId,
              this._planFromName(planName),
              [this._expiresAtFromDays(days)],
            ),
      mode === 'activate' ? 'Subscription activated' : 'Subscription renewed',
    );
    this._dialogState.set('closed');
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

  protected async _triggerAutoRenewals(): Promise<void> {
    await this._runQueueAction(
      'auto-renewals',
      () => this.#actor().triggerAutoRenewals(),
      'Auto renewals triggered',
    );
  }

  protected async _triggerExpireOverdue(): Promise<void> {
    await this._runQueueAction(
      'expire-overdue',
      () => this.#actor().triggerExpireOverdue(),
      'Overdue subscriptions expired',
    );
  }

  protected _userTargets(values: ReadonlyArray<unknown>): UserTarget[] {
    return values.filter((value): value is UserTarget =>
      this._isUserTarget(value),
    );
  }

  protected _userTargetSummary(targets: ReadonlyArray<UserTarget>): string {
    if (!targets.length) return 'Search user';
    if (targets.length === 1) return targets[0].label;
    return `${targets.length} selected`;
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

  private _dialogTargetUserId(): Principal | null {
    const target = this._dialogTargets()[0];
    if (!target || target.kind === 'email') return null;

    try {
      return Principal.fromText(target.principalId);
    } catch {
      return null;
    }
  }

  private _endOfDayNanos(date: Date): bigint {
    return BigInt(endOfDay(date).getTime()) * 1_000_000n;
  }

  private _expiresAtFromDays(days: number): bigint {
    return BigInt(Date.now() + days * 24 * 60 * 60 * 1000) * 1_000_000n;
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

  private _multiOptionFilter(columnId: string): string[] {
    const filter = this._filters().find(
      (item): item is RbthMultiOptionFilterModel =>
        item.columnId === columnId && item.type === 'multiOption',
    );
    if (!filter || !filter.values.length) return [];
    if (filter.operator !== 'include' && filter.operator !== 'includeAnyOf') {
      return [];
    }
    return filter.values;
  }

  private _planFilter(): [] | [Plan[]] {
    const plans = this._multiOptionFilter('plan').map((plan) =>
      this._planFromName(plan),
    );
    return plans.length ? [plans] : [];
  }

  private _planFromName(plan: string): Plan {
    if (plan === 'Pro') return { Pro: null };
    return { Free: null };
  }

  private async _runQueueAction(
    action: string,
    operation: () => Promise<unknown>,
    successMessage: string,
  ): Promise<void> {
    this._actionInFlight.set(action);
    try {
      await operation();
      toast.success(successMessage);
      this._subscriptions.reload();
    } catch (error) {
      console.error(`Failed to run subscription action ${action}`, error);
      toast.error('Subscription action failed');
    } finally {
      this._actionInFlight.set(null);
    }
  }

  private async _runSubscriptionAction(
    userId: Principal,
    action: string,
    operation: () => Promise<unknown>,
    successMessage: string,
  ): Promise<void> {
    const actionId = `${userId.toText()}:${action}`;
    this._actionInFlight.set(actionId);
    try {
      await operation();
      toast.success(successMessage);
      this._subscriptions.reload();
    } catch (error) {
      console.error(`Failed to run subscription action ${action}`, error);
      toast.error('Subscription action failed');
    } finally {
      this._actionInFlight.set(null);
    }
  }

  private _sortDirectionValue(): SortDirection {
    return this._sortDirection() === 'asc'
      ? { Ascending: null }
      : { Descending: null };
  }

  private _sortFieldForColumn(columnId: string): DateField | null {
    switch (columnId) {
      case 'activatedAt':
      case 'createdAt':
      case 'expiresAt':
      case 'updatedAt':
        return columnId;
      default:
        return null;
    }
  }

  private _startOfDayNanos(date: Date): bigint {
    return BigInt(startOfDay(date).getTime()) * 1_000_000n;
  }

  private _statusFilter(): [] | [Status[]] {
    const statuses = this._multiOptionFilter('status').map((status) =>
      this._statusFromName(status),
    );
    return statuses.length ? [statuses] : [];
  }

  private _statusFromName(status: string): Status {
    if (status === 'Active') return { Active: null };
    if (status === 'Cancelled') return { Cancelled: null };
    return { Expired: null };
  }

  private _userFilter(): [] | [Principal[]] {
    const filter = this._filters().find(
      (item) => item.columnId === 'user' && item.type === 'custom',
    );
    if (!filter) return [];

    const principals = this._userTargets(filter.values)
      .filter((target) => target.kind !== 'email')
      .map((target) => target.principalId)
      .map((principalId) => Principal.fromText(principalId));

    return principals.length ? [principals] : [];
  }

  private _visibleColumnDefs(
    columns: ReadonlyArray<ColumnDef<Subscription>>,
  ): ColumnDef<Subscription>[] {
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
