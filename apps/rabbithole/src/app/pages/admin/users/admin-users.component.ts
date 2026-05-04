import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { Principal } from '@icp-sdk/core/principal';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  hugeApple,
  hugeDeveloper,
  hugeGoogle,
  hugeInfinity01,
  hugeMicrosoft,
} from '@ng-icons/huge-icons';
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
  ColumnSizingState,
  ColumnDef,
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
  MAIN_BACKEND_URL_TOKEN,
  timeInNanosToDate,
  UserTarget,
  UserTargetComboboxComponent,
  UserTargetComboboxValueDirective,
} from '@rabbithole/core';
import { UserIdentityComponent } from '@rabbithole/ui';
import {
  RbthDataTableFilterComponent,
  RbthDateFilterModel,
  RbthFilterValueDirective,
  RbthTransparentSelectBackdropDirective,
  rbthFilterColumn,
  RbthFilterModel,
  RbthFiltersState,
} from '@rabbithole/ui/data-table-filter';
import {
  AdminUserListItem,
  AdminUserListOptions,
  AdminUsersPage,
  PublicProfileSummary,
  Role,
  SortDirection,
} from '@rabbithole/declarations/backend';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCheckbox } from '@spartan-ng/helm/checkbox';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

type AdminDateField =
  | 'createdAt'
  | 'identitySyncedAt'
  | 'lastLoginAt'
  | 'referralAppliedAt'
  | 'updatedAt';
type AdminSortField = AdminDateField | 'name' | 'role';
type ColumnId =
  | 'createdAt'
  | 'email'
  | 'identityProvider'
  | 'identitySyncedAt'
  | 'inviter'
  | 'lastLoginAt'
  | 'name'
  | 'principal'
  | 'profileAvatarUrl'
  | 'profileDisplayName'
  | 'profileUsername'
  | 'referralAppliedAt'
  | 'role'
  | 'trialUsed'
  | 'updatedAt'
  | 'user'
  | 'verifiedEmail';
type SortDirectionName = 'asc' | 'desc';
type UserRoleValue = 'admin' | 'moderator' | 'user';

const EMPTY_PAGE: AdminUsersPage = {
  data: [],
  total: [],
};

@Component({
  selector: 'app-admin-users',
  imports: [
    DatePipe,
    HlmBadge,
    NgIcon,
    HlmCheckbox,
    HlmIcon,
    HlmSpinner,
    CopyToClipboardComponent,
    RbthDataTableFilterComponent,
    RbthFilterValueDirective,
    RbthTransparentSelectBackdropDirective,
    UserIdentityComponent,
    UserTargetComboboxComponent,
    UserTargetComboboxValueDirective,
    ...HlmDropdownMenuImports,
    ...HlmButtonImports,
    ...HlmSelectImports,
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
      lucideRefreshCw,
      hugeApple,
      hugeDeveloper,
      hugeGoogle,
      hugeInfinity01,
      hugeMicrosoft,
    }),
  ],
  templateUrl: './admin-users.component.html',
  host: {
    class: 'flex min-w-0 w-full flex-col gap-6',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUsersComponent {
  protected readonly _actionRoleOptions: Array<{
    label: string;
    value: UserRoleValue;
  }> = [
    { label: 'Admin', value: 'admin' },
    { label: 'Moderator', value: 'moderator' },
    { label: 'User', value: 'user' },
  ];
  readonly #actor = injectMainActor();
  protected readonly _columnOptions: Array<{
    id: ColumnId;
    label: string;
    required?: boolean;
  }> = [
    { id: 'user', label: 'User', required: true },
    { id: 'role', label: 'Role' },
    { id: 'email', label: 'Email' },
    { id: 'identityProvider', label: 'Auth provider' },
    { id: 'inviter', label: 'Inviter' },
    { id: 'trialUsed', label: 'Trial' },
    { id: 'createdAt', label: 'Created' },
    { id: 'lastLoginAt', label: 'Last login' },
    { id: 'principal', label: 'Principal ID' },
    { id: 'name', label: 'User name' },
    { id: 'verifiedEmail', label: 'Verified email' },
    { id: 'updatedAt', label: 'Updated' },
    { id: 'identitySyncedAt', label: 'Identity synced' },
    { id: 'referralAppliedAt', label: 'Referral applied' },
  ];
  protected readonly _columns: ColumnDef<AdminUserListItem>[] = [
    { id: 'user', header: 'User', minSize: 320, size: 420 },
    {
      id: 'identityAttributes',
      header: 'Identity Attributes',
      columns: [
        { id: 'name', header: 'Name', minSize: 180, size: 220 },
        { id: 'email', header: 'Email', minSize: 220, size: 260 },
        { id: 'verifiedEmail', header: 'Verified', minSize: 96, size: 110 },
        { id: 'identityProvider', header: 'Auth', minSize: 140, size: 160 },
        { id: 'principal', header: 'Principal ID', minSize: 360, size: 520 },
      ],
    },
    {
      id: 'access',
      header: 'Access',
      columns: [
        { id: 'role', header: 'Role', minSize: 120, size: 140 },
        { id: 'trialUsed', header: 'Trial', minSize: 80, size: 96 },
        { id: 'inviter', header: 'Inviter', minSize: 360, size: 520 },
      ],
    },
    {
      id: 'activity',
      header: 'Activity',
      columns: [
        { id: 'createdAt', header: 'Created', minSize: 180, size: 210 },
        { id: 'updatedAt', header: 'Updated', minSize: 180, size: 210 },
        { id: 'lastLoginAt', header: 'Last login', minSize: 180, size: 210 },
        {
          id: 'identitySyncedAt',
          header: 'Identity synced',
          minSize: 180,
          size: 210,
        },
        {
          id: 'referralAppliedAt',
          header: 'Referral applied',
          minSize: 180,
          size: 210,
        },
      ],
    },
  ];
  protected readonly _filterColumns = [
    rbthFilterColumn.custom<AdminUserListItem>({
      id: 'id',
      label: 'User',
      operators: ['isAnyOf'],
    }),
    rbthFilterColumn.custom<AdminUserListItem>({
      id: 'inviter',
      label: 'Inviter',
      operators: ['isAnyOf'],
    }),
    rbthFilterColumn.option<AdminUserListItem>({
      id: 'role',
      label: 'Role',
      operators: ['is'],
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Moderator', value: 'moderator' },
        { label: 'User', value: 'user' },
      ],
    }),
    rbthFilterColumn.boolean<AdminUserListItem>({
      falseLabel: 'Unused',
      id: 'trialUsed',
      label: 'Trial',
      operators: ['is'],
      trueLabel: 'Used',
    }),
    rbthFilterColumn.boolean<AdminUserListItem>({
      falseLabel: 'Unverified',
      id: 'verifiedEmail',
      label: 'Verified email',
      operators: ['is'],
      trueLabel: 'Verified',
    }),
    rbthFilterColumn.option<AdminUserListItem>({
      id: 'identityProvider',
      label: 'Auth provider',
      operators: ['is'],
      options: [
        { label: 'Apple', value: 'apple' },
        { label: 'Dev OpenID', value: 'dev_openid' },
        { label: 'Internet Identity', value: 'internet_identity' },
        { label: 'Google', value: 'google' },
        { label: 'Microsoft', value: 'microsoft' },
      ],
    }),
    rbthFilterColumn.date<AdminUserListItem>({
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
    rbthFilterColumn.date<AdminUserListItem>({
      id: 'lastLoginAt',
      label: 'Last login',
      operators: [
        'on',
        'before',
        'onOrBefore',
        'after',
        'onOrAfter',
        'between',
      ],
    }),
    rbthFilterColumn.date<AdminUserListItem>({
      id: 'updatedAt',
      label: 'Updated',
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
  protected readonly _columnSizing = signal<ColumnSizingState>({});

  protected readonly _hiddenColumns = signal<Set<ColumnId>>(
    new Set<ColumnId>([
      'inviter',
      'principal',
      'profileAvatarUrl',
      'profileDisplayName',
      'identitySyncedAt',
      'profileUsername',
      'referralAppliedAt',
      'updatedAt',
      'verifiedEmail',
    ]),
  );

  protected readonly _pageIndex = signal(0);

  protected readonly _pageSize = signal(20);
  protected readonly _sortField = signal<AdminSortField>('createdAt');
  protected readonly _options = computed<AdminUserListOptions>(() => ({
    pagination: {
      offset: BigInt(this._pageIndex() * this._pageSize()),
      limit: BigInt(this._pageSize()),
    },
    count: true,
    sort: [[this._sortField(), this._sortDirectionValue()]],
    filter: {
      id: this._principalFilter('id'),
      inviter: this._principalFilter('inviter'),
      createdAt: this._dateFilter('createdAt'),
      lastLoginAt: this._dateFilter('lastLoginAt'),
      identitySyncedAt: [],
      referralAppliedAt: [],
      role: this._roleOption(),
      verifiedEmail: this._booleanOption('verifiedEmail'),
      trialUsed: this._booleanOption('trialUsed'),
      identityProvider: this._identityProviderOption(),
      search: [],
      updatedAt: this._dateFilter('updatedAt'),
    },
  }));
  protected readonly _users = resource({
    params: () => ({
      actor: this.#actor(),
      options: this._options(),
    }),
    loader: async ({ params }) => params.actor.adminListUsers(params.options),
    defaultValue: EMPTY_PAGE,
  });
  protected readonly _rows = computed(() => this._users.value().data);

  protected readonly _total = computed(() => {
    const total = this._users.value().total;
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
  protected readonly _visibleColumns = computed(() => {
    return this._visibleColumnDefs(this._columns);
  });
  protected readonly _table = createAngularTable<AdminUserListItem>(() => ({
    data: this._rows(),
    columns: this._visibleColumns(),
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: 'onChange',
    manualPagination: true,
    pageCount: this._pageCount(),
    onColumnSizingChange: (updater) => this._setColumnSizing(updater),
    state: {
      columnSizing: this._columnSizing(),
      columnPinning: {
        left: ['user'],
        right: [],
      },
    },
  }));

  protected readonly _updatingRoleFor = signal<string | null>(null);
  readonly #backendUrl = inject(MAIN_BACKEND_URL_TOKEN);

  protected async _changeUserRole(
    user: AdminUserListItem,
    role: UserRoleValue,
  ): Promise<void> {
    if (this._isRole(user.role, role)) return;

    const id = user.id.toText();
    this._updatingRoleFor.set(id);

    try {
      await this.#actor().setUserRole(user.id, this._roleFromValue(role));
      toast.success('User role updated');
      this._users.reload();
    } catch (error) {
      console.error('Failed to update user role', error);
      toast.error('Failed to update user role');
    } finally {
      this._updatingRoleFor.set(null);
    }
  }

  protected _columnVisible(columnId: ColumnId): boolean {
    return !this._hiddenColumns().has(columnId);
  }

  protected _identityProviderLabel(provider: string): string {
    if (provider === 'apple') return 'Apple';
    if (provider === 'dev_openid') return 'Dev OpenID';
    if (provider === 'google') return 'Google';
    if (provider === 'internet_identity') return 'Internet Identity';
    if (provider === 'microsoft') return 'Microsoft';
    return provider;
  }

  protected _date(value: bigint): Date {
    return timeInNanosToDate(value);
  }

  protected _isRole(role: Role, value: UserRoleValue): boolean {
    return value in role;
  }

  protected _nextPage(): void {
    this._pageIndex.update((pageIndex) =>
      Math.min(this._pageCount() - 1, pageIndex + 1),
    );
  }

  protected _optionalDate(value: [] | [bigint]): Date | null {
    return value[0] ? this._date(value[0]) : null;
  }

  protected _optionalText(value: [] | [string]): string {
    return value[0] ?? '';
  }

  protected _previousPage(): void {
    this._pageIndex.update((pageIndex) => Math.max(0, pageIndex - 1));
  }

  protected _profile(
    user: AdminUserListItem,
  ): PublicProfileSummary | undefined {
    return user.profile[0];
  }

  protected _reloadUsers(): void {
    this._users.reload();
  }

  protected _roleLabel(role: Role): string {
    return this._roleLabelByValue(this._roleValue(role));
  }

  protected _roleValue(role: Role): UserRoleValue {
    if ('admin' in role) return 'admin';
    if ('moderator' in role) return 'moderator';
    return 'user';
  }

  protected _setPageSize(value: number | null): void {
    if (!value) return;
    this._pageSize.set(value);
    this._pageIndex.set(0);
  }

  protected _setFilters(filters: RbthFiltersState): void {
    this._filters.set(filters);
    this._pageIndex.set(0);
  }

  protected _setColumnSizing(updater: Updater<ColumnSizingState>): void {
    this._columnSizing.update((state) => functionalUpdate(updater, state));
  }

  protected _setUserRole(
    user: AdminUserListItem,
    value: UserRoleValue | null,
  ): void {
    if (!value) return;
    void this._changeUserRole(user, value);
  }

  protected _shortPrincipal(principalId: string): string {
    return principalId.length > 20
      ? `${principalId.slice(0, 8)}...${principalId.slice(-7)}`
      : principalId;
  }

  protected _sortable(columnId: string): boolean {
    return this._adminSortField(columnId) != null;
  }

  protected _sortIcon(columnId: string): string {
    if (this._sortField() !== columnId) return 'lucideArrowUpDown';
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
    const sortField = this._adminSortField(columnId);
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

  protected _userLabel(user: AdminUserListItem): string {
    const profile = this._profile(user);
    if (profile?.displayName[0] && profile.username) {
      return `${profile.displayName[0]} · @${profile.username}`;
    }

    return profile?.username
      ? `@${profile.username}`
      : this._shortPrincipal(user.id.toText());
  }

  protected _profileAvatarSrc(user: AdminUserListItem): string | undefined {
    return this._avatarSrc(this._profile(user)?.avatarUrl[0]);
  }

  protected _userTargetSummary(targets: ReadonlyArray<UserTarget>): string {
    if (!targets.length) return 'Search user';
    if (targets.length === 1) return targets[0].label;
    return `${targets.length} selected`;
  }

  protected _userTargets(values: ReadonlyArray<unknown>): UserTarget[] {
    return values.filter((value): value is UserTarget =>
      this._isUserTarget(value),
    );
  }

  private _identityProviderOption(): [] | [string] {
    const value = this._optionValue('identityProvider');
    return value ? [value] : [];
  }

  private _booleanOption(columnId: string): [] | [boolean] {
    const filter = this._filters().find(
      (item): item is Extract<RbthFilterModel, { type: 'boolean' }> =>
        item.columnId === columnId && item.type === 'boolean',
    );
    if (!filter || filter.values[0] === undefined) return [];

    return [filter.operator === 'isNot' ? !filter.values[0] : filter.values[0]];
  }

  private _dateFilter(
    field: AdminDateField,
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
      case 'onOrAfter': {
        const value = filter.values[0];
        return value ? [{ min: [this._startOfDayNanos(value)], max: [] }] : [];
      }
      case 'onOrBefore': {
        const value = filter.values[0];
        return value ? [{ min: [], max: [this._endOfDayNanos(value)] }] : [];
      }
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
      case 'notBetween':
      case 'notOn':
        return [];
    }
  }

  private _dateFilterModel(
    field: AdminDateField,
  ): RbthDateFilterModel | undefined {
    return this._filters().find(
      (filter): filter is RbthDateFilterModel =>
        filter.columnId === field && filter.type === 'date',
    );
  }

  private _endOfDayNanos(date: Date): bigint {
    return BigInt(endOfDay(date).getTime()) * 1_000_000n;
  }

  private _principalFilter(columnId: string): [] | [Principal[]] {
    const filter = this._filters().find(
      (item) => item.columnId === columnId && item.type === 'custom',
    );
    if (!filter) return [];

    return this._principalFilterFromTargets(this._userTargets(filter.values));
  }

  private _principalFilterFromTargets(
    targets: ReadonlyArray<UserTarget>,
  ): [] | [Principal[]] {
    const principals = targets
      .filter((target) => target.kind !== 'email')
      .map((target) => target.principalId)
      .map((principalId) => Principal.fromText(principalId));

    return principals.length ? [principals] : [];
  }

  private _optionValue(columnId: string): string | undefined {
    const filter = this._filters().find(
      (item): item is Extract<RbthFilterModel, { type: 'option' }> =>
        item.columnId === columnId && item.type === 'option',
    );

    return filter?.values[0];
  }

  private _roleOption(): [] | [Role] {
    const role = this._optionValue('role');
    if (!this._isUserRoleValue(role)) return [];
    return [this._roleFromValue(role)];
  }

  private _roleFromValue(role: UserRoleValue): Role {
    switch (role) {
      case 'admin':
        return { admin: null };
      case 'moderator':
        return { moderator: null };
      case 'user':
        return { user: null };
    }
  }

  private _isUserRoleValue(value: string | undefined): value is UserRoleValue {
    return value === 'admin' || value === 'moderator' || value === 'user';
  }

  private _roleLabelByValue(role: UserRoleValue): string {
    switch (role) {
      case 'admin':
        return 'Admin';
      case 'moderator':
        return 'Moderator';
      case 'user':
        return 'User';
    }
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

  private _avatarSrc(avatarUrl: string | undefined): string | undefined {
    if (!avatarUrl) return undefined;
    if (/^(https?:|data:|blob:)/.test(avatarUrl)) return avatarUrl;
    return `${this.#backendUrl}${avatarUrl.startsWith('/') ? '' : '/'}${avatarUrl}`;
  }

  private _sortDirectionValue(): SortDirection {
    return this._sortDirection() === 'asc'
      ? { Ascending: null }
      : { Descending: null };
  }

  private _startOfDayNanos(date: Date): bigint {
    return BigInt(startOfDay(date).getTime()) * 1_000_000n;
  }

  private _adminSortField(columnId: string): AdminSortField | null {
    switch (columnId) {
      case 'createdAt':
      case 'lastLoginAt':
      case 'name':
      case 'identitySyncedAt':
      case 'referralAppliedAt':
      case 'role':
      case 'updatedAt':
        return columnId;
      default:
        return null;
    }
  }

  private _isColumnId(columnId: string): columnId is ColumnId {
    return this._columnOptions.some((column) => column.id === columnId);
  }

  private _visibleColumnDefs(
    columns: ReadonlyArray<ColumnDef<AdminUserListItem>>,
  ): ColumnDef<AdminUserListItem>[] {
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
