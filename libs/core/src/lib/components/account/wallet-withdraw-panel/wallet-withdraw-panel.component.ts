import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowUpRight } from '@ng-icons/lucide';

import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

import type { TokenBalance } from '../../../services/balance.service';
import { WalletWithdrawContentComponent } from '../wallet-withdraw-content/wallet-withdraw-content.component';

export type {
  WalletWithdrawExecutor,
  WalletWithdrawRequest,
} from '../../../injectors/wallet-withdraw';

@Component({
  selector: 'rbth-core-wallet-withdraw-panel',
  imports: [
    HlmIcon,
    HlmSpinner,
    NgIcon,
    WalletWithdrawContentComponent,
    ...HlmButtonImports,
  ],
  providers: [provideIcons({ lucideArrowUpRight })],
  templateUrl: './wallet-withdraw-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletWithdrawPanelComponent {
  readonly cancelled = output<void>();
  readonly completed = output<void>();

  readonly token = input.required<TokenBalance>();
  readonly tokenChange = output<TokenBalance>();
  readonly tokens = input<readonly TokenBalance[]>([]);
}
