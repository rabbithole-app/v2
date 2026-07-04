import { Clipboard } from '@angular/cdk/clipboard';
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBan, lucideLink, lucideTrash2 } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';

import { formatDiscountPercent, timeInNanosToDate } from '@rabbithole/core';
import type { Coupon } from '@rabbithole/declarations/backend';
import { CopyToClipboardComponent } from '@rabbithole/ui/copy-to-clipboard';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { computeCouponStatus, CouponStatus } from '../../utils/coupon-status';

const STATUS_VARIANT: Record<CouponStatus, 'default' | 'destructive' | 'secondary'> = {
  active: 'default',
  expired: 'secondary',
  exhausted: 'secondary',
  revoked: 'destructive',
};

@Component({
  selector: 'rbth-feat-coupons-table',
  imports: [
    CopyToClipboardComponent,
    DatePipe,
    NgIcon,
    HlmBadge,
    HlmButton,
    HlmIcon,
    ...HlmTableImports,
    ...HlmTooltipImports,
  ],
  providers: [provideIcons({ lucideBan, lucideLink, lucideTrash2 })],
  templateUrl: './coupons-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full' },
})
export class CouponsTableComponent {
  readonly coupons = input<Coupon[]>([]);
  readonly remove = output<string>();
  readonly revoke = output<string>();

  protected readonly _formatDiscount = formatDiscountPercent;

  readonly #clipboard = inject(Clipboard);

  protected _copyInviteLink(coupon: Coupon): void {
    this.#clipboard.copy(`${window.location.origin}/?ref=${coupon.code}`);
    toast.success('Invite link copied.');
  }

  protected _createdAt(coupon: Coupon): number {
    return timeInNanosToDate(coupon.createdAt).getTime();
  }

  protected _expiry(coupon: Coupon): number | null {
    const expiresAt = coupon.expiresAt[0];
    return expiresAt !== undefined
      ? timeInNanosToDate(expiresAt).getTime()
      : null;
  }

  protected _redemptions(coupon: Coupon): string {
    const max = coupon.maxRedemptions[0];
    return `${coupon.redeemedCount}/${max !== undefined ? max : '∞'}`;
  }

  protected _status(coupon: Coupon): CouponStatus {
    return computeCouponStatus(coupon, Date.now());
  }

  protected _statusVariant(coupon: Coupon): 'default' | 'destructive' | 'secondary' {
    return STATUS_VARIANT[this._status(coupon)];
  }
}
