import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideExternalLink,
  lucideHardDrive,
} from '@ng-icons/lucide';

import {
  formatBytes,
  IS_PRODUCTION_TOKEN,
  timeInNanosToDate,
} from '@rabbithole/core';
import {
  CreationListItem,
  Role,
  Status,
  Subscription,
} from '@rabbithole/declarations/backend';
import { CopyToClipboardComponent } from '@rabbithole/ui/copy-to-clipboard';
import {
  RbthFrameComponent,
  RbthFrameHeaderDirective,
  RbthFramePanelDirective,
  RbthFrameTitleDirective,
} from '@rabbithole/ui/frame';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmItemImports } from '@spartan-ng/helm/item';
import { HlmTypographyImports } from '@spartan-ng/helm/typography';

import { AdminUserDetailResolverData } from './admin-user-detail.resolver';

type BadgeVariant = 'default' | 'destructive' | 'outline' | 'secondary';

@Component({
  selector: 'app-admin-user-overview',
  imports: [
    CopyToClipboardComponent,
    DatePipe,
    HlmBadge,
    HlmIcon,
    NgIcon,
    RbthFrameComponent,
    RbthFrameHeaderDirective,
    RbthFramePanelDirective,
    RbthFrameTitleDirective,
    ...HlmButtonImports,
    ...HlmItemImports,
    ...HlmTypographyImports,
  ],
  providers: [
    provideIcons({
      lucideCheck,
      lucideExternalLink,
      lucideHardDrive,
    }),
  ],
  templateUrl: './admin-user-overview.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUserOverviewComponent {
  readonly userDetail = input.required<AdminUserDetailResolverData>();

  readonly #isProduction = inject(IS_PRODUCTION_TOKEN);

  protected _badgeVariant(value: string): BadgeVariant {
    if (value === 'Failed' || value === 'failed' || value === 'refunded') {
      return 'destructive';
    }
    if (value === 'pending') return 'secondary';
    return 'outline';
  }

  protected _canisterAppUrl(creation: CreationListItem): string | null {
    const canisterId = this._canisterIdText(creation);
    if (!canisterId) return null;

    const domain = this.#isProduction ? 'icp0.io' : 'localhost';
    return `https://${canisterId}.${domain}`;
  }

  protected _canisterIdText(creation: CreationListItem): string | null {
    return creation.canisterId[0]?.toText() ?? null;
  }

  protected _creationLabel(creation: CreationListItem): string {
    if (creation.isUpgrade) return 'Upgrade';
    return 'Storage';
  }

  protected _date(value: bigint): Date {
    return timeInNanosToDate(value);
  }

  protected _formatBytes(value: bigint): string {
    return formatBytes(Number(value));
  }

  protected _optionalDate(value: [] | [bigint]): Date | null {
    return value[0] ? this._date(value[0]) : null;
  }

  protected _optionalText(value: [] | [string]): string {
    return value[0] ?? 'none';
  }

  protected _planLabel(plan: Subscription['plan']): string {
    if ('Pro' in plan) return 'Pro';
    return 'Free';
  }

  protected _roleLabel(role: Role): string {
    if ('admin' in role) return 'Admin';
    if ('moderator' in role) return 'Moderator';
    return 'User';
  }

  protected _statusLabel(status: Status): string {
    if ('Active' in status) return 'Active';
    if ('Expired' in status) return 'Expired';
    return 'Cancelled';
  }

  protected _statusVariant(status: Status): BadgeVariant {
    if ('Active' in status) return 'default';
    if ('Expired' in status) return 'secondary';
    return 'destructive';
  }
}
