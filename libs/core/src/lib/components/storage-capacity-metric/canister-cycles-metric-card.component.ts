import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  input,
  linkedSignal,
  resource,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Principal } from '@icp-sdk/core/principal';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronDown,
  lucideChevronUp,
  lucideCircleHelp,
  lucideRefreshCw,
  lucideZap,
} from '@ng-icons/lucide';
import type { BrnDialogState } from '@spartan-ng/brain/dialog';
import { toast } from '@spartan-ng/brain/sonner';
import { cva } from 'class-variance-authority';
import { startWith } from 'rxjs';

import {
  RbthMetricCardComponent,
  RbthMetricCardContentDirective,
  RbthMetricCardFooterDirective,
  RbthMetricCardHeaderDirective,
  RbthMetricCardTitleDirective,
} from '@rabbithole/ui/metric-card';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmHoverCardImports } from '@spartan-ng/helm/hover-card';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { HlmSwitch } from '@spartan-ng/helm/switch';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { injectMainActor } from '../../injectors/main-actor';
import {
  injectEncryptedStorageActor,
  provideEncryptedStorageActor,
} from '../../injectors/storage-actor';
import { CyclesMintingCanisterService } from '../../services/cycles-minting-canister.service';
import { SettingsService } from '../../services/settings.service';
import { StorageFundingService } from '../../services/storage-funding.service';
import { ENCRYPTED_STORAGE_CANISTER_ID } from '../../tokens/encrypted-storage-canister';
import { formatTCycles } from '../../utils/cycles';
import { formatUsd } from '../../utils/format-number';
import { parseCanisterRejectError } from '../../utils/parse-canister-reject-error';
import { calculatePaymentEligibility } from '../../utils/payment-eligibility';
import { BalanceService, WalletBalancePanelComponent } from '../account/wallet';
import { MetricLegendRowComponent } from './metric-legend-row.component';
import { StorageCapacityMetricStateService } from './storage-capacity-metric-state.service';
import {
  CanisterCyclesMetricSnapshot,
  CycleStatus,
  EMPTY_CANISTER_CYCLES_METRIC_SNAPSHOT,
  maxBigInt,
  MetricSnapshotSource,
  stickyMetricSnapshot,
} from './storage-capacity-metric.types';

const CYCLES_PER_TENTH_TC = 100_000_000_000n;

const cycleStatusBadgeVariants = cva(
  'rounded-full px-1.5 py-0.5 text-[0.64rem] font-medium',
  {
    variants: {
      status: {
        buffer: 'bg-amber-100 text-amber-800',
        critical: 'bg-red-100 text-red-700',
        low: 'bg-amber-100 text-amber-800',
        ready: 'bg-emerald-100 text-emerald-700',
      },
    },
  },
);

const cycleStatusDotVariants = cva(
  'absolute top-1 right-1 h-1.5 w-1.5 rounded-full',
  {
    variants: {
      status: {
        buffer: 'bg-amber-500',
        critical: 'bg-red-500',
        low: 'bg-amber-500',
        ready: 'bg-emerald-500',
      },
    },
  },
);

const refreshIconVariants = cva('', {
  variants: {
    loading: {
      false: '',
      true: 'animate-spin',
    },
  },
});

type CyclesMetricResourceParams = {
  canisterId: string | null;
  forceRefresh: boolean;
};

@Component({
  selector: 'core-canister-cycles-metric-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'contents',
  },
  templateUrl: './canister-cycles-metric-card.component.html',
  imports: [
    HlmButton,
    HlmIcon,
    HlmInput,
    HlmSpinner,
    HlmSwitch,
    MetricLegendRowComponent,
    NgTemplateOutlet,
    NgIcon,
    ReactiveFormsModule,
    RbthMetricCardComponent,
    RbthMetricCardContentDirective,
    RbthMetricCardFooterDirective,
    RbthMetricCardHeaderDirective,
    RbthMetricCardTitleDirective,
    WalletBalancePanelComponent,
    ...HlmDialogImports,
    ...HlmFieldImports,
    ...HlmHoverCardImports,
    ...HlmTooltipImports,
  ],
  providers: [
    provideIcons({
      lucideChevronDown,
      lucideChevronUp,
      lucideCircleHelp,
      lucideRefreshCw,
      lucideZap,
    }),
  ],
})
export class CanisterCyclesMetricCardComponent {
  readonly canisterId = input<string | null>(null);
  readonly #refreshNonce = signal(0);

  readonly #metrics = resource({
    params: (): CyclesMetricResourceParams => ({
      canisterId: this.canisterId(),
      forceRefresh: this.#refreshNonce() > 0,
    }),
    loader: ({ params }) => this.#load(params),
    defaultValue: EMPTY_CANISTER_CYCLES_METRIC_SNAPSHOT,
  });
  readonly snapshot = linkedSignal<
    MetricSnapshotSource<CanisterCyclesMetricSnapshot>,
    CanisterCyclesMetricSnapshot
  >({
    source: computed(() => ({
      canisterId: this.canisterId(),
      value: this.#metrics.value() ?? EMPTY_CANISTER_CYCLES_METRIC_SNAPSHOT,
    })),
    computation: (source, previous) =>
      stickyMetricSnapshot({
        canisterId: source.canisterId,
        isVisible: source.value.canViewCycleMetrics,
        value: source.value,
        emptyValue: EMPTY_CANISTER_CYCLES_METRIC_SNAPSHOT,
        previous,
      }),
  });
  readonly cycleSafeFloorBalance = computed(
    () => this.snapshot().minimumSafeBalance,
  );
  readonly cycleTargetBalance = computed(() =>
    maxBigInt(this.snapshot().requiredBalance, this.cycleSafeFloorBalance()),
  );
  readonly availableCycleBalance = computed(() => {
    const snapshot = this.snapshot();
    const target = this.cycleTargetBalance();
    return snapshot.cycleBalance > target ? snapshot.cycleBalance - target : 0n;
  });
  readonly #storageFundingService = inject(StorageFundingService);
  readonly storageFundingStatus = this.#storageFundingService.status;
  readonly managedFundingEligible = computed(
    () => this.storageFundingStatus()?.managedFundingEligible ?? false,
  );
  readonly paidAutoTopUpInFlight = signal(false);

  readonly #settingsService = inject(SettingsService);

  readonly canTogglePaidAutoTopUp = computed(
    () =>
      this.managedFundingEligible() &&
      this.#settingsService.settings() !== null &&
      !this.paidAutoTopUpInFlight(),
  );
  readonly #fb = inject(FormBuilder);
  readonly topUpAmountControl = this.#fb.nonNullable.control(1, {
    validators: [Validators.required, Validators.min(0.1)],
  });
  readonly topUpTc = toSignal(
    this.topUpAmountControl.valueChanges.pipe(
      startWith(this.topUpAmountControl.value),
    ),
    { requireSync: true },
  );
  readonly topUpCycles = computed(() => tcToCycles(this.topUpTc()));
  readonly #balanceService = inject(BalanceService);
  readonly #cmcService = inject(CyclesMintingCanisterService);
  readonly topUpEstimatedUsd = computed(() => {
    const cyclesPerIcp = this.#cmcService.icpXdrConversionRate.value();
    const icpUsd = this.#balanceService.rates()['ICP'] ?? 0;
    if (!cyclesPerIcp || cyclesPerIcp <= 0n || icpUsd <= 0) return 0;

    return (Number(this.topUpCycles()) / Number(cyclesPerIcp)) * icpUsd;
  });

  readonly topUpEligibility = computed(() =>
    calculatePaymentEligibility(
      this.#balanceService.balances(),
      this.topUpEstimatedUsd(),
    ),
  );
  readonly topUpInFlight = signal(false);
  readonly canTopUp = computed(
    () =>
      this.topUpAmountControl.valid &&
      this.topUpEstimatedUsd() > 0 &&
      this.topUpEligibility().status === 'sufficient' &&
      !this.topUpInFlight(),
  );
  readonly compact = input(false);
  readonly cycleScale = computed(() =>
    maxBigInt(
      1n,
      this.snapshot().cycleBalance,
      this.snapshot().currentFreezingReserve,
      this.cycleTargetBalance(),
    ),
  );
  readonly cycleAvailableWidth = computed(() =>
    this.#width(this.availableCycleBalance(), this.cycleScale()),
  );
  readonly cycleDeficit = computed(() => {
    const snapshot = this.snapshot();
    const target = this.cycleSafeFloorBalance();
    return target > snapshot.cycleBalance ? target - snapshot.cycleBalance : 0n;
  });

  readonly cycleFreezeLeft = computed(() =>
    this.#cycleBalancePosition(this.snapshot().currentFreezingReserve),
  );
  readonly cycleFreezeWidth = computed(() =>
    this.#width(this.snapshot().currentFreezingReserve, this.cycleScale()),
  );
  readonly cycleSafeFloorLeft = computed(() =>
    this.#cycleBalancePosition(this.cycleSafeFloorBalance()),
  );
  readonly cycleSafeFloorReserveWidth = computed(() => {
    const freeze = this.snapshot().currentFreezingReserve;
    const safeFloor = this.cycleSafeFloorBalance();
    return this.#width(
      safeFloor > freeze ? safeFloor - freeze : 0n,
      this.cycleScale(),
    );
  });
  readonly cycleStatus = computed<CycleStatus>(() => {
    const snapshot = this.snapshot();
    if (
      snapshot.currentFreezingReserve > 0n &&
      snapshot.cycleBalance <= snapshot.currentFreezingReserve
    ) {
      return 'critical';
    }
    if (snapshot.cycleBalance < this.cycleSafeFloorBalance()) return 'low';
    if (snapshot.cycleBalance < this.cycleTargetBalance()) return 'buffer';
    return 'ready';
  });
  readonly cycleStatusBadgeClass = computed(() =>
    cycleStatusBadgeVariants({ status: this.cycleStatus() }),
  );
  readonly cycleStatusDotClass = computed(() =>
    cycleStatusDotVariants({ status: this.cycleStatus() }),
  );
  readonly cycleStatusLabel = computed(() => {
    switch (this.cycleStatus()) {
      case 'buffer':
        return 'Buffer';
      case 'critical':
        return 'Freeze';
      case 'low':
        return 'Low';
      case 'ready':
        return 'Healthy';
    }
  });
  readonly cycleTargetBufferWidth = computed(() => {
    const safeFloor = this.cycleSafeFloorBalance();
    const target = this.cycleTargetBalance();
    return this.#width(
      target > safeFloor ? target - safeFloor : 0n,
      this.cycleScale(),
    );
  });
  readonly cycleTargetLeft = computed(() =>
    this.#cycleBalancePosition(this.cycleTargetBalance()),
  );
  readonly #metricState = inject(StorageCapacityMetricStateService);
  readonly detailsExpanded = this.#metricState.cyclesExpanded;
  readonly freezeTooltip = computed(
    () =>
      `Freezing reserve: below ${this.formatCycles(this.snapshot().currentFreezingReserve)} this canister can freeze.`,
  );
  readonly hasAvailableCycles = computed(
    () => this.availableCycleBalance() > 0n,
  );
  readonly hasSafeFloorReserve = computed(
    () => this.cycleSafeFloorBalance() > this.snapshot().currentFreezingReserve,
  );
  readonly hasTargetBuffer = computed(
    () => this.cycleTargetBalance() > this.cycleSafeFloorBalance(),
  );
  readonly includedFundingStatus = computed(() => {
    const status = this.storageFundingStatus();
    if (!status?.managedFundingEligible) return null;
    return status;
  });
  readonly loading = computed(() => this.#metrics.isLoading());
  readonly paidAutoTopUpEnabled = this.#settingsService.autoTopUp;
  readonly paidAutoTopUpSwitchChecked = computed(
    () => this.managedFundingEligible() && this.paidAutoTopUpEnabled(),
  );
  readonly paidAutoTopUpTooltip = computed(() => {
    if (!this.managedFundingEligible()) {
      return 'Upgrade to Pro to enable paid storage auto top-up.';
    }

    const status = this.storageFundingStatus();
    if (!status) return 'Loading auto top-up settings.';

    return `After included funding is used, add ${this.formatCycles(status.paidTopUpAmountCycles)} from balance.`;
  });
  readonly projectedCycleBalance = computed(
    () => this.snapshot().cycleBalance + this.topUpCycles(),
  );
  readonly refreshIconClass = computed(() =>
    refreshIconVariants({ loading: this.loading() }),
  );
  readonly safeFloorTooltip = computed(
    () =>
      `Safe floor: ${this.formatCycles(this.cycleSafeFloorBalance())} covers freezing reserve, active upload work, vetKey derivation, commit, and margin.`,
  );
  readonly showCard = computed(
    () =>
      this.canisterId() !== null &&
      (this.loading() || this.snapshot().canViewCycleMetrics),
  );
  readonly targetTooltip = computed(
    () =>
      `Top-up target: ${this.formatCycles(this.cycleTargetBalance())}. This is the safe floor plus the managed funding buffer.`,
  );
  readonly topUpCostLabel = computed(() => {
    const cost = this.topUpEstimatedUsd();
    return cost > 0 ? formatUsd(cost) : 'unavailable';
  });
  readonly topUpDialogState = signal<BrnDialogState>('closed');
  readonly topUpDisabledReason = computed(() => {
    if (this.topUpInFlight()) return null;
    if (this.topUpAmountControl.invalid) return 'Enter at least 0.1 TCycles.';
    if (this.topUpEstimatedUsd() <= 0) {
      return 'Exchange rate is unavailable. Refresh balances and try again.';
    }
    if (this.topUpEligibility().status !== 'sufficient') {
      return this.topUpEligibility().hint;
    }
    return null;
  });
  readonly #injector = inject(Injector);
  readonly #mainActor = injectMainActor();

  formatCycles(value: bigint): string {
    return `${formatTCycles(value)} TCycles`;
  }

  formatIncludedCycles(value: bigint): string {
    return this.formatCycles(value);
  }

  formatIncludedTopUp(used: bigint, limit: bigint): string {
    return `${formatTCycles(used)} / ${formatTCycles(limit)} TCycles`;
  }

  async onPaidAutoTopUpChange(enabled: boolean): Promise<void> {
    if (!this.canTogglePaidAutoTopUp()) return;
    const settings = this.#settingsService.settings();
    if (!settings) return;

    this.paidAutoTopUpInFlight.set(true);
    try {
      await this.#settingsService.updateSettings({
        ...settings,
        autoTopUp: enabled,
      });
      this.#storageFundingService.reload();
    } finally {
      this.paidAutoTopUpInFlight.set(false);
    }
  }

  openTopUpDialog(): void {
    this.topUpAmountControl.setValue(suggestTopUpTc(this.cycleDeficit()));
    this.topUpAmountControl.markAsPristine();
    this.topUpAmountControl.markAsUntouched();
    this.#balanceService.reload();
    this.#cmcService.icpXdrConversionRate.reload();
    this.topUpDialogState.set('open');
  }

  refreshMetrics(): void {
    this.#refreshNonce.update((value) => value + 1);
    this.#storageFundingService.reload();
  }

  async submitTopUp(): Promise<void> {
    if (!this.canTopUp()) return;
    const canisterId = this.canisterId();
    if (!canisterId) return;

    this.topUpInFlight.set(true);
    try {
      const result = await this.#mainActor().topUpFromBalance(
        Principal.fromText(canisterId),
        this.topUpCycles(),
      );

      if ('err' in result) {
        throw new Error(result.err);
      }

      toast.success(`Added ${this.formatCycles(result.ok.cyclesAdded)}.`);
      this.topUpDialogState.set('closed');
      this.refreshMetrics();
      this.#balanceService.reload();
    } catch (error) {
      const message =
        parseCanisterRejectError(error) ??
        (error instanceof Error ? error.message : 'Top-up failed');
      toast.error(`Top-up failed: ${message}`);
    } finally {
      this.topUpInFlight.set(false);
    }
  }

  toggleDetailsExpanded(): void {
    this.#metricState.toggleCyclesDetails();
  }

  #cycleBalancePosition(value: bigint): string {
    return this.#width(value, this.cycleScale());
  }

  async #load({
    canisterId,
    forceRefresh,
  }: CyclesMetricResourceParams): Promise<CanisterCyclesMetricSnapshot> {
    if (!canisterId) return EMPTY_CANISTER_CYCLES_METRIC_SNAPSHOT;

    return this.#withStorageActor(canisterId, async () => {
      const actor = injectEncryptedStorageActor();
      let cyclesMetrics = storageResultOk(
        forceRefresh
          ? await actor().refreshCanisterCyclesCardMetrics()
          : await actor().getCanisterCyclesCardMetrics(),
      );

      if (!cyclesMetrics && forceRefresh) {
        try {
          cyclesMetrics = storageResultOk(
            await actor().getCanisterCyclesCardMetrics(),
          );
        } catch {
          // Keep the refresh failure as an unavailable card.
        }
      }

      if (!cyclesMetrics) return EMPTY_CANISTER_CYCLES_METRIC_SNAPSHOT;

      return {
        canViewCycleMetrics: true,
        cycleBalance: cyclesMetrics.balance,
        currentFreezingReserve: cyclesMetrics.safety.currentFreezingReserve,
        minimumSafeBalance: cyclesMetrics.safety.minimumSafeBalance,
        requiredBalance: cyclesMetrics.safety.targetBalance,
      };
    });
  }

  #width(value: bigint, total: bigint): string {
    if (total <= 0n) return '0%';
    const clamped = value > total ? total : value;
    const basisPoints = Number((clamped * 10_000n) / total);
    return `${basisPoints / 100}%`;
  }

  async #withStorageActor<T>(
    canisterId: string,
    run: () => Promise<T>,
  ): Promise<T> {
    const storagePrincipal = Principal.fromText(canisterId);

    return runInInjectionContext(
      Injector.create({
        providers: [
          {
            provide: ENCRYPTED_STORAGE_CANISTER_ID,
            useValue: storagePrincipal,
          },
          provideEncryptedStorageActor(),
        ],
        parent: this.#injector,
      }),
      run,
    );
  }
}

function storageResultOk<T>(result: { err: unknown } | { ok: T }): T | null {
  return 'ok' in result ? result.ok : null;
}

function suggestTopUpTc(deficit: bigint): number {
  if (deficit <= 0n) return 1;
  const tenths = (deficit + CYCLES_PER_TENTH_TC - 1n) / CYCLES_PER_TENTH_TC;
  return Math.max(0.1, Number(tenths) / 10);
}

function tcToCycles(value: number): bigint {
  if (!Number.isFinite(value) || value <= 0) return 0n;
  return BigInt(Math.round(value * 10)) * CYCLES_PER_TENTH_TC;
}
