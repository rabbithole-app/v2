import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown, lucideRefreshCw } from '@ng-icons/lucide';

import {
  RbthFrameComponent,
  RbthFrameDescriptionDirective,
  RbthFrameFooterDirective,
  RbthFrameHeaderDirective,
  RbthFramePanelDirective,
  RbthFrameTitleDirective,
} from '@rabbithole/ui/frame';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCollapsibleImports } from '@spartan-ng/helm/collapsible';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { BalanceService } from '../../../services/balance.service';
import { calculatePaymentEligibility } from '../../../utils/payment-eligibility';
import { WalletNetworksViewComponent } from '../wallet-networks-view/wallet-networks-view.component';
import { WalletSummaryHeaderComponent } from '../wallet-summary-header/wallet-summary-header.component';

@Component({
  selector: 'core-wallet-balance-payment-panel',
  imports: [
    NgIcon,
    HlmIcon,
    RbthFrameComponent,
    RbthFrameDescriptionDirective,
    RbthFrameFooterDirective,
    RbthFrameHeaderDirective,
    RbthFramePanelDirective,
    RbthFrameTitleDirective,
    WalletNetworksViewComponent,
    WalletSummaryHeaderComponent,
    ...HlmButtonImports,
    ...HlmCollapsibleImports,
    ...HlmTooltipImports,
  ],
  providers: [provideIcons({ lucideChevronDown, lucideRefreshCw })],
  host: { class: 'block' },
  templateUrl: './wallet-balance-payment-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletBalancePaymentPanelComponent {
  readonly requiredUsd = input.required<number>();
  readonly payButtonLabel = input<string>('Pay from balance');

  readonly payRequested = output<void>();

  readonly expanded = signal(false);

  readonly #balanceService = inject(BalanceService);

  readonly eligibility = computed(() =>
    calculatePaymentEligibility(
      this.#balanceService.balances(),
      this.requiredUsd(),
    ),
  );

  readonly canPay = computed(() => this.eligibility().status === 'sufficient');

  /** Re-fetch wallet addresses, FX rates, and on-chain balances. Use after
   * topping up SOL/ETH/ICP so the UI shows the new funds without a page reload. */
  refresh(): void {
    this.#balanceService.reload();
  }
}
