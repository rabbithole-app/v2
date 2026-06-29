import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { AccountIdentifier, SubAccount } from '@icp-sdk/canisters/ledger/icp';
import { Actor } from '@icp-sdk/core/agent';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeftFromLine,
  lucideArrowRightToLine,
  lucideCircleAlert,
  lucideCoins,
  lucideWallet,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';

import { CopyToClipboardComponent } from '@rabbithole/ui/copy-to-clipboard';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmItemImports } from '@spartan-ng/helm/item';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import {
  injectMainActor,
  injectWalletWithdrawLauncher,
} from '../../../injectors';
import {
  moveIcPrincipalBalanceToWallet,
  TOKEN_CONFIGS,
  type TokenBalance,
  type TokenConfig,
} from '../../../services/balance.service';
import { MAIN_CANISTER_ID_TOKEN } from '../../../tokens';
import { formatTokenAmount, formatUsd } from '../../../utils/format-number';
import { WalletWithdrawPanelComponent } from '../wallet-withdraw-panel/wallet-withdraw-panel.component';
import { injectWalletBalanceContext } from '../wallet/wallet-balance-context';

export type WalletNetworksView = 'overview' | 'withdraw';

type NetworkDefinition = {
  addressLabel: string;
  emptyDescription: string;
  generateLabel?: string;
  id: TokenConfig['chain'];
  note: string;
  tabLabel: string;
  title: string;
};
type WalletChain = NetworkDefinition['id'];

const NETWORK_DEFINITIONS: NetworkDefinition[] = [
  {
    id: 'ic',
    tabLabel: 'Internet Computer',
    title: 'Internet Computer',
    addressLabel: 'Account ID',
    emptyDescription:
      'Preparing your managed Internet Computer deposit account.',
    note: 'Use this account only on Internet Computer.',
  },
  {
    id: 'base',
    tabLabel: 'Base',
    title: 'Base',
    addressLabel: 'Deposit address',
    emptyDescription:
      'Generate a dedicated Base deposit address for this account.',
    generateLabel: 'Generate address',
    note: 'Use this address only on Base.',
  },
  {
    id: 'solana',
    tabLabel: 'Solana',
    title: 'Solana',
    addressLabel: 'Deposit address',
    emptyDescription:
      'Generate a dedicated Solana deposit address for this account.',
    generateLabel: 'Generate address',
    note: 'Use this address only on Solana.',
  },
];

@Component({
  selector: 'rbth-core-wallet-networks-view',
  imports: [
    NgIcon,
    HlmBadge,
    HlmIcon,
    HlmSpinner,
    CopyToClipboardComponent,
    WalletWithdrawPanelComponent,
    ...HlmAlertImports,
    ...HlmButtonImports,
    ...HlmEmptyImports,
    ...HlmFieldImports,
    ...HlmItemImports,
    ...HlmTableImports,
    ...HlmTabsImports,
    ...HlmTooltipImports,
  ],
  providers: [
    provideIcons({
      lucideArrowLeftFromLine,
      lucideArrowRightToLine,
      lucideCircleAlert,
      lucideCoins,
      lucideWallet,
    }),
  ],
  host: { class: 'block w-full' },
  templateUrl: './wallet-networks-view.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletNetworksViewComponent {
  readonly activeTab = signal<WalletChain>('ic');
  readonly activeView = model<WalletNetworksView>('overview');
  readonly canGenerateAddresses = input(true);
  readonly canMovePrincipalFunds = input(true);
  readonly #walletContext = injectWalletBalanceContext();
  readonly error = this.#walletContext.error;
  readonly generatingChain = signal<WalletChain | null>(null);
  readonly hideZeroBalances = input<boolean | null>(null);
  readonly hideZero = computed(
    () => this.hideZeroBalances() ?? this.#walletContext.hideZero(),
  );
  readonly walletAddresses = this.#walletContext.walletAddresses;
  readonly #backendCanisterId = inject(MAIN_CANISTER_ID_TOKEN);
  readonly icAccountId = computed(() => {
    const wallet = this.walletAddresses();
    if (!wallet) return null;

    const bytes =
      wallet.icSubaccount instanceof Uint8Array
        ? wallet.icSubaccount
        : new Uint8Array(wallet.icSubaccount);
    const subAccount = SubAccount.fromBytes(bytes);
    if (subAccount instanceof Error) return null;

    return AccountIdentifier.fromPrincipal({
      principal: this.#backendCanisterId,
      subAccount,
    }).toHex();
  });
  readonly isLoading = this.#walletContext.isLoading;
  readonly movingToken = signal<string | null>(null);
  readonly networks = computed(() =>
    NETWORK_DEFINITIONS.map((network) => {
      const balances = this.getVisibleBalances(network.id);
      return {
        ...network,
        acceptedAssets: this.getAcceptedAssets(network.id),
        address: this.getAddress(network.id),
        balances,
        principalTotalUsd: balances.reduce(
          (sum, token) => sum + (token.principalUsdValue ?? 0),
          0,
        ),
        totalUsd: balances.reduce((sum, token) => sum + token.usdValue, 0),
      };
    }),
  );
  readonly showPrincipalDepositAccount = input(true);
  readonly principalId = computed(() => {
    if (!this.showPrincipalDepositAccount()) return null;
    return this.#walletContext.principal?.()?.toText() ?? null;
  });
  readonly visibleBalances = computed(() => {
    const source = this.#walletContext.balances();
    return this.hideZero()
      ? source.filter((balance) => this.isVisibleBalance(balance))
      : source;
  });

  readonly withdrawToken = signal<TokenBalance | null>(null);
  readonly withdrawTokenOptions = computed(() =>
    this.canMovePrincipalFunds() ? this.#walletContext.balances() : [],
  );
  readonly #actor = injectMainActor();

  readonly #withdrawLauncher = injectWalletWithdrawLauncher({
    optional: true,
  });

  backToOverview(): void {
    this.activeView.set('overview');
    this.withdrawToken.set(null);
  }

  canMovePrincipalBalance(token: TokenBalance): boolean {
    return (
      this.canMovePrincipalFunds() &&
      this.showPrincipalDepositAccount() &&
      token.chain === 'ic' &&
      (token.principalBalance ?? 0n) > 0n
    );
  }

  canWithdrawBalance(token: TokenBalance): boolean {
    return this.canMovePrincipalFunds() && token.balance > 0n;
  }

  formatBalance(balance: bigint, decimals: number): string {
    return formatTokenAmount(balance, decimals);
  }

  formatUsd(value: number): string {
    return formatUsd(value);
  }

  async generateAddress(chain: WalletChain): Promise<void> {
    if (
      chain === 'ic' ||
      !this.canGenerateAddresses() ||
      this.isGenerating(chain)
    )
      return;

    this.generatingChain.set(chain);
    const toastId = toast.loading(
      chain === 'base'
        ? 'Generating Base address...'
        : 'Generating Solana address...',
    );

    try {
      const actor = this.#actor();
      const result =
        chain === 'base'
          ? await actor.getEvmAddress()
          : await actor.getSolAddress();
      const address = result[0] ?? null;

      if (!address) {
        throw new Error('Address generation is not available right now');
      }

      this.#walletContext.reload();
      toast.success(
        chain === 'base'
          ? 'Base address generated'
          : 'Solana address generated',
        { id: toastId },
      );
      this.activeTab.set(chain);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate address';
      toast.error(message, { id: toastId });
    } finally {
      this.generatingChain.set(null);
    }
  }

  handleWithdrawCompleted(): void {
    this.#walletContext.reload();
  }

  isGenerating(chain: WalletChain): boolean {
    return this.generatingChain() === chain;
  }

  isMoving(token: TokenBalance): boolean {
    return this.movingToken() === this.tokenKey(token);
  }

  async movePrincipalBalance(token: TokenBalance): Promise<void> {
    if (!this.canMovePrincipalBalance(token) || this.isMoving(token)) return;

    const wallet = this.walletAddresses();
    if (!wallet) {
      toast.error('Wallet address is not available');
      return;
    }

    const actor = this.#actor();
    const ledgerAgent = Actor.agentOf(actor);
    if (!ledgerAgent) {
      toast.error('Signed wallet session is not available');
      return;
    }

    const destinationSubaccount =
      wallet.icSubaccount instanceof Uint8Array
        ? wallet.icSubaccount
        : new Uint8Array(wallet.icSubaccount);
    const tokenKey = this.tokenKey(token);
    this.movingToken.set(tokenKey);
    const toastId = toast.loading(`Moving ${token.label} into Rabbithole...`);

    try {
      await moveIcPrincipalBalanceToWallet({
        destinationOwner: this.#backendCanisterId,
        destinationSubaccount,
        ledgerAgent,
        token,
      });
      this.#walletContext.reload();
      toast.success(`${token.label} moved into Rabbithole`, { id: toastId });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Failed to move ${token.label}`;
      toast.error(message, { id: toastId });
    } finally {
      this.movingToken.set(null);
    }
  }

  networkWarning(chain: WalletChain): string {
    const accepted = this.getAcceptedAssets(chain);
    const suffix = joinTokenLabels(accepted);
    const title =
      NETWORK_DEFINITIONS.find((network) => network.id === chain)?.title ??
      chain;
    return `Send only ${suffix} on ${title} to this address.`;
  }

  openWithdraw(token: TokenBalance): void {
    if (!this.canWithdrawBalance(token)) return;

    if (this.#withdrawLauncher) {
      this.activeTab.set(token.chain);
      this.#withdrawLauncher.open({
        completed: () => this.handleWithdrawCompleted(),
        refresh: () => this.#walletContext.reload(),
        token,
        tokens: this.withdrawTokenOptions(),
      });
      return;
    }

    this.withdrawToken.set(token);
    this.activeTab.set(token.chain);
    this.activeView.set('withdraw');
  }

  principalBalance(token: TokenBalance): bigint {
    return token.principalBalance ?? 0n;
  }

  principalUsdValue(token: TokenBalance): number {
    return token.principalUsdValue ?? 0;
  }

  selectTab(chain: WalletChain): void {
    this.activeTab.set(chain);
  }

  showUsdValue(token: TokenBalance, value: number): boolean {
    return token.showUsdValue && value > 0;
  }

  private getAcceptedAssets(chain: WalletChain): string[] {
    return TOKEN_CONFIGS.filter((token) => token.chain === chain).map(
      (token) => token.label,
    );
  }

  private getAddress(chain: WalletChain): string | null {
    if (chain === 'ic') {
      return this.icAccountId();
    }

    const wallet = this.walletAddresses();
    if (!wallet) return null;

    if (chain === 'base') return wallet.evmAddress?.[0] ?? null;
    return wallet.solAddress?.[0] ?? null;
  }

  private getVisibleBalances(chain: WalletChain): TokenBalance[] {
    return this.visibleBalances().filter((balance) => balance.chain === chain);
  }

  private isVisibleBalance(balance: TokenBalance): boolean {
    return (
      balance.balance > 0n ||
      (this.showPrincipalDepositAccount() &&
        balance.chain === 'ic' &&
        (balance.principalBalance ?? 0n) > 0n)
    );
  }

  private tokenKey(token: TokenBalance): string {
    return `${token.chain}:${token.label}`;
  }
}

function joinTokenLabels(tokens: string[]): string {
  if (tokens.length <= 1) return tokens.join('');
  if (tokens.length === 2) return `${tokens[0]} and ${tokens[1]}`;

  return `${tokens.slice(0, -1).join(', ')} and ${tokens.at(-1)}`;
}
