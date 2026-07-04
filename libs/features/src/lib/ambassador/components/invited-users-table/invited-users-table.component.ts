import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import {
  ColumnDef,
  createAngularTable,
  FlexRenderDirective,
  getCoreRowModel,
} from '@tanstack/angular-table';

import { AvatarService, formatUsd, timeInNanosToDate } from '@rabbithole/core';
import type { InvitedUserItem } from '@rabbithole/declarations/backend';
import { UserIdentityComponent } from '@rabbithole/ui';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmTableImports } from '@spartan-ng/helm/table';

interface InvitedRow {
  item: InvitedUserItem;
}

@Component({
  selector: 'rbth-feat-invited-users-table',
  imports: [
    DatePipe,
    FlexRenderDirective,
    HlmBadge,
    UserIdentityComponent,
    ...HlmTableImports,
  ],
  templateUrl: './invited-users-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full' },
})
export class InvitedUsersTableComponent {
  readonly earnedUsdByPayer = input<Map<string, number>>(new Map());
  readonly invitedUsers = input<InvitedUserItem[]>([]);
  readonly paidPayerIds = input<Set<string>>(new Set());

  get table(): ReturnType<typeof createAngularTable<InvitedRow>> {
    return this._table;
  }

  protected readonly _columns: ColumnDef<InvitedRow>[] = [
    { id: 'user', header: 'User', enableHiding: false },
    { id: 'referred', header: 'Referred', enableHiding: false },
    { id: 'earned', header: 'Earned', enableHiding: false },
  ];

  private readonly _data = computed<InvitedRow[]>(() =>
    this.invitedUsers().map((item) => ({ item })),
  );

  private readonly _table = createAngularTable<InvitedRow>(() => ({
    data: this._data(),
    columns: this._columns,
    getCoreRowModel: getCoreRowModel(),
  }));

  readonly #avatarService = inject(AvatarService);

  protected _avatarSrc(item: InvitedUserItem): string | undefined {
    return this.#avatarService.avatarSrc(item.profile[0]?.avatarRef[0]) ?? undefined;
  }

  protected _displayName(item: InvitedUserItem): string {
    const profile = item.profile[0];
    if (profile) return profile.displayName[0] ?? profile.username;
    return this._shortPrincipal(item);
  }

  protected _earnedUsd(item: InvitedUserItem): string | null {
    const earned = this.earnedUsdByPayer().get(item.id.toText());
    if (earned === undefined || earned <= 0) return null;
    return `≈ ${formatUsd(earned)}`;
  }

  protected _hasPaid(item: InvitedUserItem): boolean {
    return this.paidPayerIds().has(item.id.toText());
  }

  protected _principalText(item: InvitedUserItem): string {
    return item.id.toText();
  }

  protected _referredAt(item: InvitedUserItem): number | null {
    const appliedAt = item.referralAppliedAt[0];
    return appliedAt !== undefined
      ? timeInNanosToDate(appliedAt).getTime()
      : null;
  }

  protected _shortPrincipal(item: InvitedUserItem): string {
    const text = item.id.toText();
    return text.length > 12 ? `${text.slice(0, 5)}…${text.slice(-5)}` : text;
  }
}
