import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { AccountIdentifier, SubAccount } from '@icp-sdk/canisters/ledger/icp';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleAlert,
  lucideCoins,
  lucideWallet,
} from '@ng-icons/lucide';
import { toast } from 'ngx-sonner';

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

import { injectMainActor } from '../../../injectors';
import {
  BalanceService,
  TOKEN_CONFIGS,
  type TokenBalance,
  type TokenConfig,
  type WalletAddresses,
} from '../../../services/balance.service';
import { MAIN_CANISTER_ID_TOKEN } from '../../../tokens';
import { formatUsd } from '../../../utils/format-number';

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
    addressLabel: 'Managed account ID',
    emptyDescription: 'Preparing your managed IC deposit account.',
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
  selector: 'core-wallet-networks-view',
  imports: [
    NgIcon,
    HlmBadge,
    HlmIcon,
    HlmSpinner,
    CopyToClipboardComponent,
    ...HlmAlertImports,
    ...HlmButtonImports,
    ...HlmEmptyImports,
    ...HlmFieldImports,
    ...HlmItemImports,
    ...HlmTableImports,
    ...HlmTabsImports,
  ],
  providers: [
    provideIcons({
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
  readonly balances = input<TokenBalance[] | null>(null);
  readonly canGenerateAddresses = input(true);
  readonly generatingChain = signal<WalletChain | null>(null);

  readonly hideZeroBalances = input<boolean | null>(null);
  readonly #balanceService = inject(BalanceService);

  readonly hideZero = computed(
    () => this.hideZeroBalances() ?? this.#balanceService.hideZero(),
  );
  readonly walletAddressesInput = input<WalletAddresses | null>(null, {
    alias: 'walletAddresses',
  });
  readonly walletAddresses = computed(
    () => this.walletAddressesInput() ?? this.#balanceService.walletAddresses(),
  );

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
  readonly networks = computed(() =>
    NETWORK_DEFINITIONS.map((network) => {
      const balances = this.getVisibleBalances(network.id);
      return {
        ...network,
        acceptedAssets: this.getAcceptedAssets(network.id),
        address: this.getAddress(network.id),
        balances,
        totalUsd: balances.reduce((sum, token) => sum + token.usdValue, 0),
      };
    }),
  );

  readonly visibleBalances = computed(() => {
    const balances = this.balances();
    if (!balances) return this.#balanceService.visibleBalances();
    return this.hideZero()
      ? balances.filter((balance) => balance.balance > 0n)
      : balances;
  });

  readonly #actor = injectMainActor();

  formatBalance(balance: bigint, decimals: number): string {
    return formatTokenAmount(balance, decimals);
  }

  formatUsd(value: number): string {
    return formatUsd(value);
  }

  async generateAddress(chain: WalletChain): Promise<void> {
    if (chain === 'ic' || !this.canGenerateAddresses() || this.isGenerating(chain)) return;

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

      this.#balanceService.reload();
      toast.success(
        chain === 'base' ? 'Base address generated' : 'Solana address generated',
        { id: toastId },
      );
      this.activeTab.set(chain);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to generate address';
      toast.error(message, { id: toastId });
    } finally {
      this.generatingChain.set(null);
    }
  }

  isGenerating(chain: WalletChain): boolean {
    return this.generatingChain() === chain;
  }

  networkWarning(chain: WalletChain): string {
    const accepted = this.getAcceptedAssets(chain);
    const suffix = joinTokenLabels(accepted);
    const title =
      NETWORK_DEFINITIONS.find((network) => network.id === chain)?.title ??
      chain;
    return `Send only ${suffix} on ${title} to this address.`;
  }

  selectTab(chain: WalletChain): void {
    this.activeTab.set(chain);
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
}

function formatTokenAmount(balance: bigint, decimals: number): string {
  const normalizedDecimals = Math.max(decimals, 0);
  const isNegative = balance < 0n;
  const absolute = isNegative ? -balance : balance;
  const divisor = 10n ** BigInt(normalizedDecimals);
  const whole = absolute / divisor;
  const fraction = absolute % divisor;
  const groupedWhole = groupIntegerDigits(whole.toString());

  if (normalizedDecimals === 0) {
    return isNegative ? `-${groupedWhole}` : groupedWhole;
  }

  const fractionDigits = fraction
    .toString()
    .padStart(normalizedDecimals, '0')
    .slice(0, Math.min(normalizedDecimals, 6))
    .replace(/0+$/, '');

  const formatted =
    fractionDigits.length > 0
      ? `${groupedWhole}.${fractionDigits}`
      : groupedWhole;

  return isNegative ? `-${formatted}` : formatted;
}

function groupIntegerDigits(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function joinTokenLabels(tokens: string[]): string {
  if (tokens.length <= 1) return tokens.join('');
  if (tokens.length === 2) return `${tokens[0]} and ${tokens[1]}`;

  return `${tokens.slice(0, -1).join(', ')} and ${tokens.at(-1)}`;
}
