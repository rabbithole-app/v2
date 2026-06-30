import {
  ChangeDetectionStrategy,
  Component,
  inject,
  type Provider,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowUpRight, lucideRefreshCw } from '@ng-icons/lucide';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';

import { HlmButtonImports } from '@spartan-ng/helm/button';
import {
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogService,
  HlmDialogTitle,
} from '@spartan-ng/helm/dialog';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

import {
  injectWalletWithdraw,
  WALLET_WITHDRAW_LAUNCHER_TOKEN,
  WALLET_WITHDRAW_TOKEN,
  type WalletWithdrawLauncher,
  type WalletWithdrawLaunchParams,
} from '../../../injectors/wallet-withdraw';
import type { TokenBalance } from '../../../services/balance.service';
import { WalletWithdrawContentComponent } from '../wallet-withdraw-content/wallet-withdraw-content.component';

export interface WalletWithdrawDialogContext {
  completed?: () => void;
  refresh?: () => void;
  token: TokenBalance;
  tokens: readonly TokenBalance[];
}

export function provideWalletWithdrawDialogLauncher(): Provider {
  return {
    provide: WALLET_WITHDRAW_LAUNCHER_TOKEN,
    useFactory: (): WalletWithdrawLauncher => {
      const dialogService = inject(HlmDialogService);
      const withdraw = injectWalletWithdraw();

      return {
        open(params: WalletWithdrawLaunchParams): void {
          dialogService.open(WalletWithdrawDialogComponent, {
            ariaLabelledBy: 'wallet-withdraw-dialog-title',
            contentClass: 'w-[min(92vw,44rem)] max-w-none sm:max-w-2xl',
            context: params,
            providers: [
              {
                provide: WALLET_WITHDRAW_TOKEN,
                useValue: withdraw,
              },
            ],
          });
        },
      };
    },
  };
}

@Component({
  selector: 'rbth-core-wallet-withdraw-dialog',
  imports: [
    HlmDialogFooter,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmIcon,
    HlmSpinner,
    NgIcon,
    WalletWithdrawContentComponent,
    ...HlmButtonImports,
  ],
  providers: [provideIcons({ lucideArrowUpRight, lucideRefreshCw })],
  templateUrl: './wallet-withdraw-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletWithdrawDialogComponent {
  protected readonly context =
    injectBrnDialogContext<WalletWithdrawDialogContext>();
  readonly #dialogRef = inject<BrnDialogRef<void>>(BrnDialogRef);

  protected close(): void {
    this.#dialogRef.close();
  }

  protected handleCompleted(): void {
    this.context.completed?.();
  }

  protected refresh(): void {
    this.context.refresh?.();
  }
}
