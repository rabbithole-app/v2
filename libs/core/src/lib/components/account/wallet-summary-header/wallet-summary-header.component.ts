import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleAlert, lucideCircleCheck } from '@ng-icons/lucide';

import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

import { formatUsd } from '../../../utils/format-number';
import { calculatePaymentEligibility } from '../../../utils/payment-eligibility';
import { injectWalletBalanceContext } from '../wallet/wallet-balance-context';

@Component({
  selector: 'rbth-core-wallet-summary-header',
  imports: [NgIcon, HlmIcon, HlmSpinner],
  providers: [provideIcons({ lucideCircleAlert, lucideCircleCheck })],
  host: { class: 'block' },
  template: `
    <div class="flex flex-col gap-1">
      <p
        class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground"
      >
        Total asset value
      </p>
      <p
        class="font-semibold tracking-tight"
        [class.text-2xl]="size() === 'md'"
        [class.text-base]="size() === 'sm'"
      >
        @if (walletContext.isLoading()) {
          <hlm-spinner class="text-2xl" />
        } @else {
          {{ formattedTotal() }}
        }
      </p>

      @if (walletContext.error()) {
        <p class="mt-1 flex items-center gap-2 text-xs text-destructive">
          <ng-icon hlmIcon size="xs" name="lucideCircleAlert" />
          <span>Wallet balances could not be loaded.</span>
        </p>
      }

      @if (eligibility(); as e) {
        <p
          class="mt-1 flex items-center gap-2 text-xs"
          [class.text-emerald-600]="e.status === 'sufficient'"
          [class.dark:text-emerald-400]="e.status === 'sufficient'"
          [class.text-muted-foreground]="e.status !== 'sufficient'"
        >
          <ng-icon
            hlmIcon
            size="xs"
            [name]="
              e.status === 'sufficient' ? 'lucideCircleCheck' : 'lucideCircleAlert'
            "
          />
          <span>{{ e.hint }}</span>
        </p>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletSummaryHeaderComponent {
  readonly requiredUsd = input<number | null>(null);
  readonly walletContext = injectWalletBalanceContext();

  readonly eligibility = computed(() => {
    const required = this.requiredUsd();
    if (required === null) return null;
    return calculatePaymentEligibility(
      this.walletContext.balances(),
      required,
    );
  });

  readonly formattedTotal = computed(() =>
    formatUsd(this.walletContext.totalUsd()),
  );

  readonly size = input<'md' | 'sm'>('md');
}
