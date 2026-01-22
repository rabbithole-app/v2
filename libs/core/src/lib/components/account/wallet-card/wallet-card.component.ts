import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TransferError } from '@icp-sdk/canisters/ledger/icp';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowDown,
  lucideArrowUpToLine,
  lucideRefreshCw,
  lucideSendHorizontal,
} from '@ng-icons/lucide';
import { toast } from 'ngx-sonner';
import { map, startWith } from 'rxjs';
import { match, P } from 'ts-pattern';

import { HlmButton } from '@spartan-ng/helm/button';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmInputGroupImports } from '@spartan-ng/helm/input-group';
import { HlmItemImports } from '@spartan-ng/helm/item';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';

import { E8S_PER_ICP } from '../../../constants';
import { LEDGER_SERVICE_TOKEN, LedgerService } from '../../../tokens';
import { formatICP } from '../../../utils';
import { recipientValidator } from '../../../validators';

type WalletTab = 'balance' | 'review' | 'send';

@Component({
  selector: 'core-wallet-card',
  imports: [
    ReactiveFormsModule,
    NgIcon,
    HlmButton,
    HlmFieldImports,
    HlmIcon,
    HlmInput,
    HlmInputGroupImports,
    HlmSpinner,
    ...HlmItemImports,
    ...HlmTabsImports,
  ],
  providers: [
    provideIcons({
      lucideArrowDown,
      lucideArrowUpToLine,
      lucideRefreshCw,
      lucideSendHorizontal,
    }),
  ],
  templateUrl: './wallet-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletCardComponent {
  readonly #ledgerService = inject<LedgerService>(LEDGER_SERVICE_TOKEN);
  accountIdentifier = this.#ledgerService.accountIdentifier;
  activeTab = signal<WalletTab>('balance');
  #fb = inject(FormBuilder);
  amountControl = this.#fb.control<number | null>(null, [
    Validators.required,
    Validators.min(0.0001),
  ]);
  amountE8s = toSignal(
    this.amountControl.valueChanges.pipe(
      map((amount) => {
        if (amount === null) return 0n;
        return BigInt(Math.floor(amount * Number(E8S_PER_ICP)));
      }),
    ),
    { initialValue: 0n },
  );
  balance = this.#ledgerService.balance;
  transactionFee = this.#ledgerService.transactionFee;
  availableToSend = computed(() => {
    const balance = this.balance.value();
    const fee = this.transactionFee();
    const available = balance - fee;
    return available > 0n ? formatICP(available) : '0';
  });
  tokenSymbol = input('ICP');
  formattedAmount = computed(() => {
    const amount = this.amountE8s();
    return `${formatICP(amount)} ${this.tokenSymbol()}`;
  });
  formattedBalance = computed(() => {
    const balance = this.balance.value();
    return formatICP(balance);
  });
  formattedFee = computed(() => {
    const fee = this.transactionFee();
    return formatICP(fee);
  });

  isSending = signal(false);
  maxAmount = computed(() => {
    return Number(this.availableToSend());
  });

  recipientControl = this.#fb.control<string>('', [
    Validators.required,
    recipientValidator,
  ]);

  recipientValue = toSignal(
    this.recipientControl.valueChanges.pipe(
      startWith(this.recipientControl.value),
      map((value) => (value ?? '').trim()),
    ),
    { initialValue: '' },
  );

  sendForm = this.#fb.group({
    amount: this.amountControl,
    recipient: this.recipientControl,
  });

  sourceAccountId = computed(() => this.accountIdentifier().toHex());

  tokenIcon = input<string>('/icp-token-light.svg');

  tokenName = input<string>('Internet Computer');

  goToBalance(): void {
    this.activeTab.set('balance');
    this.sendForm.reset();
  }

  goToEdit(): void {
    this.activeTab.set('send');
  }

  goToReview(): void {
    if (this.sendForm.valid) {
      this.activeTab.set('review');
    }
  }

  goToSend(): void {
    this.sendForm.reset();
    this.activeTab.set('send');
  }

  refreshBalance(): void {
    this.balance.reload();
  }

  async sendTransaction(): Promise<void> {
    const value = this.sendForm.getRawValue();
    if (
      !value.recipient ||
      !value.amount ||
      !this.sendForm.valid ||
      this.isSending()
    )
      return;

    this.isSending.set(true);
    const toastId = toast.loading('Sending transaction...');

    try {
      const amount = this.amountE8s();

      await this.#ledgerService.transfer({
        to: value.recipient,
        amount,
      });

      toast.success('Transaction sent successfully', { id: toastId });
      this.goToBalance();
      this.refreshBalance();
    } catch (error) {
      const message = match(error)
        .with(P.instanceOf(TransferError), () => 'Transfer error')
        .otherwise(() => 'Unknown error');
      toast.error(`Send error: ${message}`, { id: toastId });
    } finally {
      this.isSending.set(false);
    }
  }

  setMaxAmount(): void {
    const max = this.maxAmount();
    this.sendForm.controls.amount.setValue(max);
  }
}
