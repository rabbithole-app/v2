import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideRefreshCw } from '@ng-icons/lucide';

import {
  BalanceService,
  WalletNetworksViewComponent,
  WalletSummaryHeaderComponent,
} from '@rabbithole/core';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSwitch } from '@spartan-ng/helm/switch';

@Component({
  selector: 'rbth-page-wallet',
  imports: [
    RouterLink,
    NgIcon,
    HlmIcon,
    HlmSwitch,
    WalletNetworksViewComponent,
    WalletSummaryHeaderComponent,
    ...HlmButtonImports,
  ],
  providers: [provideIcons({ lucideRefreshCw })],
  templateUrl: './wallet-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletPageComponent {
  readonly #balanceService = inject(BalanceService);

  readonly hideZero = this.#balanceService.hideZero;

  refresh(): void {
    this.#balanceService.reload();
  }

  toggleHideZero(checked: boolean): void {
    this.#balanceService.hideZero.set(checked);
  }
}
