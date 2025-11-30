import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

import { WalletCardComponent } from '../wallet-card/wallet-card.component';
import {
  formatICP,
  ICPLedgerService,
  LEDGER_SERVICE_TOKEN,
} from '@rabbithole/core';

@Component({
  selector: 'shared-icp-wallet-card',
  template: `<shared-wallet-card />`,
  imports: [WalletCardComponent],
  providers: [
    {
      provide: LEDGER_SERVICE_TOKEN,
      useClass: ICPLedgerService,
    },
  ],
  host: {
    class: 'contents',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IcpWalletCardComponent {
  balance = output<string>();
  readonly #ledgerService = inject(LEDGER_SERVICE_TOKEN);

  constructor() {
    toObservable(this.#ledgerService.balance.value)
      .pipe(
        map((v) => `${formatICP(v)} ICP`),
        takeUntilDestroyed(),
      )
      .subscribe((balance) => {
        this.balance.emit(balance);
      });
  }
}
