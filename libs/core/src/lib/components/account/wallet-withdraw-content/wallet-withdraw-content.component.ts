import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import {
  disabled,
  form,
  FormField,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import { Principal } from '@icp-sdk/core/principal';
import {
  NgIcon,
  provideIcons,
  provideNgIconLoader,
  withCaching,
} from '@ng-icons/core';
import {
  lucideArrowUpToLine,
  lucideChevronDown,
  lucideCircleCheck,
  lucideTriangleAlert,
} from '@ng-icons/lucide';

import type {
  WithdrawDestination,
  WithdrawReceipt,
} from '@rabbithole/declarations/backend';
import { CopyToClipboardComponent } from '@rabbithole/ui/copy-to-clipboard';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmInputGroupImports } from '@spartan-ng/helm/input-group';
import { HlmToggleGroupImports } from '@spartan-ng/helm/toggle-group';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { injectWalletWithdraw } from '../../../injectors/wallet-withdraw';
import type { TokenBalance } from '../../../services/balance.service';
import {
  formatTokenAmount,
  formatTokenAmountInput,
  formatUsd,
  isTokenAmountDraft,
  normalizeTokenAmountInput,
  parseTokenAmountToBaseUnits,
} from '../../../utils/format-number';
import {
  isValidEvmAddress,
  isValidSolanaAddress,
} from '../../../utils/wallet-address-validation';

type WalletChain = TokenBalance['chain'];

interface WithdrawErrorFeedback {
  kind: 'error';
  message: string;
}

type WithdrawFeedback = WithdrawErrorFeedback | WithdrawSuccessFeedback;

interface WithdrawFormModel {
  amount: string;
  chain: WalletChain;
  recipient: string;
  tokenKey: string;
}

interface WithdrawSuccessFeedback {
  kind: 'success';
  txLabel?: string;
  txValue?: string;
}

const NETWORK_ICON_PATHS = {
  rbthBase: '/base.svg',
  rbthIc: '/ic.svg',
  rbthSolana: '/solana.svg',
} as const;
type NetworkIconName = keyof typeof NETWORK_ICON_PATHS;
const NETWORK_OPTIONS: {
  iconName: NetworkIconName;
  id: WalletChain;
  label: string;
}[] = [
  {
    iconName: 'rbthIc',
    id: 'ic',
    label: 'Internet Computer',
  },
  { iconName: 'rbthBase', id: 'base', label: 'Base' },
  {
    iconName: 'rbthSolana',
    id: 'solana',
    label: 'Solana',
  },
];

@Component({
  selector: 'rbth-core-wallet-withdraw-content',
  imports: [
    FormField,
    NgIcon,
    HlmIcon,
    HlmInputGroupImports,
    HlmToggleGroupImports,
    CopyToClipboardComponent,
    ...HlmAlertImports,
    ...HlmDropdownMenuImports,
    ...HlmFieldImports,
    ...HlmTooltipImports,
  ],
  providers: [
    provideIcons({
      lucideArrowUpToLine,
      lucideChevronDown,
      lucideCircleCheck,
      lucideTriangleAlert,
    }),
    provideNgIconLoader((name) => {
      const iconPath = NETWORK_ICON_PATHS[name as NetworkIconName];
      if (!iconPath) return '';

      return fetch(iconPath).then((response) =>
        response.ok ? response.text() : '',
      );
    }, withCaching()),
  ],
  templateUrl: './wallet-withdraw-content.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletWithdrawContentComponent {
  readonly token = input.required<TokenBalance>();
  readonly tokens = input<readonly TokenBalance[]>([]);
  readonly availableTokens = computed(() => {
    const token = this.token();
    const tokens = [...this.tokens()];
    if (!tokens.some((item) => this.tokenKey(item) === this.tokenKey(token))) {
      tokens.unshift(token);
    }
    return tokens;
  });
  readonly formModel = signal<WithdrawFormModel>({
    amount: '',
    chain: 'ic',
    recipient: '',
    tokenKey: '',
  });
  readonly selectedToken = computed(() => {
    const key = this.formModel().tokenKey;
    return (
      this.availableTokens().find((token) => this.tokenKey(token) === key) ??
      null
    );
  });

  readonly availableAmount = computed(() => {
    const token = this.selectedToken();
    return token
      ? formatTokenAmount(getWithdrawableBalance(token), token.decimals)
      : '0';
  });

  readonly submitting = signal(false);

  readonly withdrawFeedback = signal<WithdrawFeedback | null>(null);
  readonly withdrawForm = form(this.formModel, (schema) => {
    required(schema.chain);
    required(schema.tokenKey, { message: 'Asset is required.' });
    required(schema.recipient, { message: 'Recipient is required.' });
    required(schema.amount, { message: 'Amount is required.' });
    disabled(schema.recipient, () => this.submitting());
    disabled(schema.amount, () => this.submitting());

    validate(schema.recipient, ({ value, valueOf }) =>
      this.validateRecipient(value(), valueOf(schema.chain)),
    );
    validate(schema.amount, ({ value, valueOf }) =>
      this.validateAmount(value(), valueOf(schema.tokenKey)),
    );
  });
  readonly canSubmit = computed(
    () =>
      !this.submitting() &&
      this.selectedToken() !== null &&
      this.withdrawForm().valid() &&
      this.withdrawFeedback()?.kind !== 'success',
  );
  readonly completed = output<void>();
  readonly errorFeedback = computed(() => {
    const feedback = this.withdrawFeedback();
    return feedback?.kind === 'error' ? feedback : null;
  });
  readonly networkOptions = NETWORK_OPTIONS;
  readonly selectedChainTokens = computed(() => {
    const chain = this.formModel().chain;
    return this.availableTokens().filter((token) => token.chain === chain);
  });
  readonly submitted = signal(false);

  readonly successFeedback = computed(() => {
    const feedback = this.withdrawFeedback();
    return feedback?.kind === 'success' ? feedback : null;
  });

  readonly tokenChange = output<TokenBalance>();
  #pendingTokenKey: string | null = null;
  readonly #withdraw = injectWalletWithdraw();

  constructor() {
    effect(() => {
      const token = this.token();
      const tokens = this.availableTokens();
      const current = this.formModel();
      const inputTokenKey = this.tokenKey(token);
      const currentToken = tokens.find(
        (item) => this.tokenKey(item) === current.tokenKey,
      );

      if (this.#pendingTokenKey === current.tokenKey) {
        if (current.tokenKey === inputTokenKey) {
          this.#pendingTokenKey = null;
        }
        return;
      }

      const nextToken =
        current.tokenKey === inputTokenKey && currentToken
          ? currentToken
          : token;

      if (
        current.tokenKey === this.tokenKey(nextToken) &&
        current.chain === nextToken.chain
      ) {
        return;
      }

      untracked(() => {
        this.formModel.update((model) => ({
          ...model,
          chain: nextToken.chain,
          tokenKey: this.tokenKey(nextToken),
        }));
      });
    });

    effect(() => {
      const model = this.formModel();
      const selected = this.selectedToken();
      if (selected?.chain === model.chain) return;

      const nextToken = this.selectedChainTokens()[0];
      if (!nextToken) return;

      untracked(() => {
        this.formModel.update((current) => ({
          ...current,
          tokenKey: this.tokenKey(nextToken),
        }));
      });
    });
  }

  amountDescription(): string {
    const token = this.selectedToken();
    if (!token) return 'Select an asset to see available balance.';

    return `Available: ${this.availableAmount()} ${token.label}`;
  }

  amountError(): string | null {
    return this.fieldError(this.withdrawForm.amount);
  }

  clearWithdrawFeedback(): void {
    if (this.submitting()) return;
    this.withdrawFeedback.set(null);
  }

  formatAvailableTokenBalance(token: TokenBalance): string {
    return formatTokenAmount(token.balance, token.decimals);
  }

  handleAmountBeforeInput(event: Event): void {
    const inputEvent = event as InputEvent;
    if (inputEvent.isComposing) return;

    const input = getInputElement(event);
    const data = inputEvent.data;
    if (!input || data === null) return;

    const selectionStart = input.selectionStart ?? input.value.length;
    const selectionEnd = input.selectionEnd ?? selectionStart;
    const nextValue =
      input.value.slice(0, selectionStart) +
      data +
      input.value.slice(selectionEnd);

    if (!isTokenAmountDraft(nextValue)) {
      event.preventDefault();
    }
  }

  handleAmountInput(event: Event): void {
    this.clearWithdrawFeedback();
    const input = getInputElement(event);
    if (!input) return;

    const rawValue = input.value;
    const sanitizedValue = normalizeTokenAmountInput(rawValue);
    const selectionStart = input.selectionStart ?? rawValue.length;

    if (rawValue !== sanitizedValue) {
      const sanitizedCursor = normalizeTokenAmountInput(
        rawValue.slice(0, selectionStart),
      ).length;
      input.value = sanitizedValue;
      input.setSelectionRange(sanitizedCursor, sanitizedCursor);
    }

    this.withdrawForm.amount().value.set(sanitizedValue);
    queueMicrotask(() => {
      if (this.formModel().amount !== sanitizedValue) {
        this.withdrawForm.amount().value.set(sanitizedValue);
      }
    });
  }

  hasTokenBalance(token: TokenBalance): boolean {
    return token.balance > 0n;
  }

  isSelectedToken(token: TokenBalance): boolean {
    return this.formModel().tokenKey === this.tokenKey(token);
  }

  networkEstimatedValueLabel(chain: WalletChain): string {
    const value = this.availableTokens()
      .filter((token) => token.chain === chain)
      .reduce((sum, token) => sum + token.usdValue, 0);

    return `≈ ${formatUsd(value)}`;
  }

  recipientError(): string | null {
    return this.fieldError(this.withdrawForm.recipient);
  }

  selectChain(value: unknown): void {
    if (!isWalletChain(value)) return;
    this.clearWithdrawFeedback();

    const nextToken = this.availableTokens().find(
      (token) => token.chain === value,
    );
    if (!nextToken) return;
    const nextTokenKey = this.tokenKey(nextToken);

    this.formModel.update((model) => ({
      ...model,
      chain: value,
      tokenKey: nextTokenKey,
    }));
    this.#pendingTokenKey = nextTokenKey;
    this.tokenChange.emit(nextToken);
  }

  selectedAssetLabel(): string {
    const token = this.selectedToken();
    if (!token) return 'Asset';

    return token.label;
  }

  selectToken(token: TokenBalance): void {
    this.clearWithdrawFeedback();
    const nextTokenKey = this.tokenKey(token);
    this.formModel.update((model) => ({
      ...model,
      chain: token.chain,
      tokenKey: nextTokenKey,
    }));
    this.#pendingTokenKey = nextTokenKey;
    this.tokenChange.emit(token);
  }

  setMaxAmount(): void {
    this.clearWithdrawFeedback();
    const token = this.selectedToken();
    if (!token) return;

    this.withdrawForm
      .amount()
      .value.set(
        formatTokenAmountInput(getWithdrawableBalance(token), token.decimals),
      );
  }

  async submit(event?: Event): Promise<void> {
    event?.preventDefault();
    this.submitted.set(true);

    await submit(this.withdrawForm, async () => {
      const token = this.selectedToken();
      const amount = token
        ? parseTokenAmountToBaseUnits(this.formModel().amount, token.decimals)
        : null;
      const destination = token ? this.buildDestination(token.chain) : null;
      if (!token || amount === null || destination === null) {
        return { kind: 'invalid', message: 'Check withdrawal details.' };
      }

      this.withdrawFeedback.set(null);
      this.submitting.set(true);

      try {
        const receipt = await this.#withdraw({
          amount,
          destination,
          token,
        });
        this.withdrawFeedback.set(buildSuccessFeedback(receipt));
        this.resetWithdrawInputs();
        this.completed.emit();
        return undefined;
      } catch (error) {
        const message = getWithdrawErrorMessage(error);
        this.withdrawFeedback.set({ kind: 'error', message });
        return { kind: 'withdrawFailed', message };
      } finally {
        this.submitting.set(false);
      }
    });
  }

  tokenKey(token: TokenBalance): string {
    return `${token.chain}:${token.label}`;
  }

  private buildDestination(chain: WalletChain): WithdrawDestination | null {
    const value = this.formModel().recipient.trim();

    if (chain === 'ic') {
      return {
        IC: {
          owner: Principal.fromText(value),
          subaccount: [],
        },
      };
    }

    if (chain === 'base') {
      return {
        EVM: {
          address: value,
        },
      };
    }

    return {
      SOL: {
        address: value,
      },
    };
  }

  private fieldError(
    field: typeof this.withdrawForm.amount | typeof this.withdrawForm.recipient,
  ): string | null {
    const state = field();
    if (!this.submitted() && !state.touched()) return null;

    return state.errors()[0]?.message ?? null;
  }

  private resetWithdrawInputs(): void {
    this.formModel.update((model) => ({
      ...model,
      amount: '',
      recipient: '',
    }));
    this.withdrawForm.recipient().reset();
    this.withdrawForm.amount().reset();
    this.submitted.set(false);
  }

  private validateAmount(
    value: string,
    tokenKey: string,
  ): { kind: string; message: string } | undefined {
    if (!value.trim()) return undefined;

    const token = this.availableTokens().find(
      (item) => this.tokenKey(item) === tokenKey,
    );
    if (!token) return { kind: 'asset', message: 'Select an asset.' };

    const parsed = parseTokenAmountToBaseUnits(value, token.decimals);
    if (parsed === null) {
      return {
        kind: 'amount',
        message: `Use up to ${token.decimals} decimal places.`,
      };
    }
    if (parsed <= 0n) {
      return { kind: 'amount', message: 'Amount must be greater than zero.' };
    }
    if (parsed > getWithdrawableBalance(token)) {
      const message =
        token.chain === 'ic'
          ? 'Amount exceeds available balance after the network fee.'
          : 'Amount exceeds balance.';
      return { kind: 'amount', message };
    }

    return undefined;
  }

  private validateRecipient(
    value: string,
    chain: WalletChain,
  ): { kind: string; message: string } | undefined {
    const recipient = value.trim();
    if (!recipient) return undefined;

    if (chain === 'ic') {
      try {
        Principal.fromText(recipient);
        return undefined;
      } catch {
        return { kind: 'recipient', message: 'Enter a valid Principal ID.' };
      }
    }

    if (chain === 'base' && !isValidEvmAddress(recipient)) {
      return { kind: 'recipient', message: 'Enter a valid Base address.' };
    }

    if (chain === 'solana' && !isValidSolanaAddress(recipient)) {
      return { kind: 'recipient', message: 'Enter a valid Solana address.' };
    }

    return undefined;
  }
}

function buildSuccessFeedback(
  receipt: WithdrawReceipt,
): WithdrawSuccessFeedback {
  if ('IC' in receipt.tx) {
    return {
      kind: 'success',
    };
  }

  if ('EVM' in receipt.tx) {
    return {
      kind: 'success',
      txLabel: 'Transaction',
      txValue: receipt.tx.EVM.txHash,
    };
  }

  return {
    kind: 'success',
    txLabel: 'Signature',
    txValue: receipt.tx.SOL.signature,
  };
}

function getInputElement(event: Event): HTMLInputElement | null {
  return event.target instanceof HTMLInputElement ? event.target : null;
}

function getWithdrawableBalance(token: TokenBalance): bigint {
  if (token.chain !== 'ic') return token.balance;

  const fee = token.withdrawFee ?? 0n;
  return token.balance > fee ? token.balance - fee : 0n;
}

function getWithdrawErrorMessage(error: unknown): string {
  if (!(error instanceof Error) || !error.message.trim()) {
    return 'Unable to complete this withdrawal. Try again later.';
  }

  if (isInternalWithdrawError(error.message)) {
    return 'Unable to complete this withdrawal. Try again later.';
  }

  return error.message;
}

function isInternalWithdrawError(message: string): boolean {
  return (
    message.includes('type mismatch') || message.includes('type on the wire')
  );
}

function isWalletChain(value: unknown): value is WalletChain {
  return NETWORK_OPTIONS.some((network) => network.id === value);
}
