import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

import { ICPLedgerService } from '../../../services';
import { LEDGER_SERVICE_TOKEN } from '../../../tokens';
import { formatICP } from '../../../utils';
import { WalletCardComponent } from '../wallet-card/wallet-card.component';

@Component({
  selector: 'core-icp-wallet-card',
  template: `<core-wallet-card />`,
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
