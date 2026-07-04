import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronLeft,
  lucideChevronRight,
  lucideHandCoins,
  lucideMegaphone,
  lucidePlus,
  lucideTrendingUp,
  lucideUserRoundCheck,
  lucideUserRoundPlus,
  lucideWallet,
} from '@ng-icons/lucide';

import { formatUsd } from '@rabbithole/core';
import { UserSettingsDialogService } from '@rabbithole/core/account-settings';
import type { CreateCouponArgs } from '@rabbithole/declarations/backend';
import { CopyToClipboardComponent } from '@rabbithole/ui/copy-to-clipboard';
import {
  RbthMetricCardComponent,
  RbthMetricCardContentDirective,
  RbthMetricCardHeaderDirective,
  RbthMetricCardTitleDirective,
} from '@rabbithole/ui/metric-card';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { HlmIcon } from '@spartan-ng/helm/icon';

import { CouponsTableComponent } from '../../components/coupons-table/coupons-table.component';
import {
  CreateCouponDialogComponent,
  CreateCouponDialogContext,
} from '../../components/create-coupon-dialog/create-coupon-dialog.component';
import { InvitedUsersTableComponent } from '../../components/invited-users-table/invited-users-table.component';
import { AmbassadorService } from '../../services/ambassador.service';
import type { EarningByToken } from '../../utils/earnings';

@Component({
  selector: 'rbth-feat-ambassador-page',
  imports: [
    NgIcon,
    HlmButton,
    HlmIcon,
    ...HlmAlertImports,
    RbthMetricCardComponent,
    RbthMetricCardHeaderDirective,
    RbthMetricCardTitleDirective,
    RbthMetricCardContentDirective,
    CopyToClipboardComponent,
    CouponsTableComponent,
    InvitedUsersTableComponent,
  ],
  providers: [
    AmbassadorService,
    provideIcons({
      lucideChevronLeft,
      lucideChevronRight,
      lucideHandCoins,
      lucideMegaphone,
      lucidePlus,
      lucideTrendingUp,
      lucideUserRoundCheck,
      lucideUserRoundPlus,
      lucideWallet,
    }),
  ],
  templateUrl: './ambassador-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full space-y-6' },
})
export class AmbassadorPageComponent {
  protected readonly _usd = formatUsd;
  protected readonly service = inject(AmbassadorService);
  readonly #dialogService = inject(HlmDialogService);
  readonly #settingsDialogService = inject(UserSettingsDialogService);

  protected _tokenBreakdown(earnings: EarningByToken[]): string {
    return earnings.map((earning) => earning.formatted).join(' · ');
  }

  protected deleteCoupon(code: string): void {
    void this.service.deleteCoupon(code);
  }

  protected openCreateCoupon(): void {
    const dialogRef = this.#dialogService.open(CreateCouponDialogComponent, {
      context: {
        discountBps: this.service.referralDiscountBps(),
      } satisfies CreateCouponDialogContext,
    });

    dialogRef.closed$.subscribe((args: CreateCouponArgs | undefined) => {
      if (args) void this.service.createCoupon(args);
    });
  }

  protected openWallet(): void {
    void this.#settingsDialogService.open('wallet');
  }

  protected revokeCoupon(code: string): void {
    void this.service.revokeCoupon(code);
  }
}
