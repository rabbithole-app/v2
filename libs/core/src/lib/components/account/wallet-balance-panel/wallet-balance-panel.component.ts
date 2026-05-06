import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown, lucideRefreshCw } from '@ng-icons/lucide';

import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCollapsibleImports } from '@spartan-ng/helm/collapsible';
import { HlmIcon } from '@spartan-ng/helm/icon';

import { calculatePaymentEligibility } from '../../../utils/payment-eligibility';
import { WalletNetworksViewComponent } from '../wallet-networks-view/wallet-networks-view.component';
import { WalletSummaryHeaderComponent } from '../wallet-summary-header/wallet-summary-header.component';
import { injectWalletBalanceContext } from '../wallet/wallet-balance-context';

@Component({
  selector: 'core-wallet-balance-panel',
  imports: [
    NgIcon,
    HlmIcon,
    WalletNetworksViewComponent,
    WalletSummaryHeaderComponent,
    ...HlmButtonImports,
    ...HlmCollapsibleImports,
  ],
  providers: [provideIcons({ lucideChevronDown, lucideRefreshCw })],
  host: { class: 'block' },
  templateUrl: './wallet-balance-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletBalancePanelComponent {
  readonly requiredUsd = input.required<number>();

  readonly #walletContext = injectWalletBalanceContext();

  readonly eligibility = computed(() =>
    calculatePaymentEligibility(
      this.#walletContext.balances(),
      this.requiredUsd(),
    ),
  );

  readonly canPay = computed(() => this.eligibility().status === 'sufficient');

  readonly expanded = signal(false);

  refresh(): void {
    this.#walletContext.reload();
  }
}
