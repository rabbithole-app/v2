import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  isDevMode,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { principalToSubAccount, toNullable } from '@dfinity/utils';
import { IcManagementCanister } from '@icp-sdk/canisters/ic-management';
import { HttpAgent } from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideCircleAlert,
  lucideCopy,
  lucideDatabase,
  lucideX,
} from '@ng-icons/lucide';
import { BrnDialogClose, BrnDialogRef } from '@spartan-ng/brain/dialog';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from '@spartan-ng/helm/dialog';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { toast } from 'ngx-sonner';
import { map, startWith } from 'rxjs';

import { CanistersService } from '../../services';
import { ControllersSelectorComponent } from '../controllers-selector/controllers-selector.component';
import { CyclesBalanceInputComponent } from '../cycles-balance-input/cycles-balance-input.component';
import { AUTH_SERVICE } from '@rabbithole/auth';
import {
  CopyToClipboardComponent,
  CYCLES_MINTING_CANISTER_ID_TOKEN,
  CyclesMintingCanisterService,
  E8S_PER_ICP,
  HTTP_AGENT_OPTIONS_TOKEN,
  ICPLedgerService,
  injectCyclesMintingCanister,
  MEMO_CANISTER_CREATE,
  ONE_TRILLION,
  parseCanisterRejectError,
} from '@rabbithole/core';

// Generates a random canisterId.
function generateRandomCanisterId(): Principal {
  const bytes = Uint8Array.from(Array(10).fill(0));
  const randomBytes = crypto.getRandomValues(new Uint8Array(3));
  bytes.set(randomBytes, bytes.length - 3);
  return Principal.fromUint8Array(bytes);
}

const CANISTER_CREATION_COST_TC = 0.5; // Fixed cost for canister creation

type State =
  | {
      canisterId: string;
      status: 'success';
    }
  | {
      errorMessage: string;
      status: 'error';
    }
  | {
      status: 'idle';
    }
  | {
      status: 'loading';
      step: 'creating-canister' | 'linking-canister' | 'transferring-icp';
    };

@Component({
  selector: 'rbth-feat-canisters-create-canister-dialog',
  imports: [
    ReactiveFormsModule,
    BrnDialogClose,
    HlmButton,
    HlmDialogHeader,
    HlmDialogFooter,
    HlmDialogTitle,
    HlmDialogDescription,
    HlmSpinner,
    NgIcon,
    ControllersSelectorComponent,
    CyclesBalanceInputComponent,
    HlmBadgeImports,
    ...HlmAlertImports,
    ...HlmFieldImports,
    ...HlmEmptyImports,
    CopyToClipboardComponent,
    NgTemplateOutlet,
  ],
  providers: [
    ICPLedgerService,
    provideIcons({
      lucideCheck,
      lucideCopy,
      lucideDatabase,
      lucideX,
      lucideCircleAlert,
    }),
  ],
  templateUrl: './create-canister-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateCanisterDialogComponent {
  readonly CANISTER_CREATION_COST_TC = CANISTER_CREATION_COST_TC;
  readonly #fb = inject(FormBuilder);
  controllersControl = this.#fb.nonNullable.control<Principal[]>([]);
  readonly controllersCount = toSignal(
    this.controllersControl.valueChanges.pipe(
      map((controllers) => controllers.length),
      startWith(this.controllersControl.value.length),
    ),
    { requireSync: true },
  );

  readonly #authService = inject(AUTH_SERVICE);
  readonly currentUserPrincipal = computed(() =>
    this.#authService.identity().getPrincipal(),
  );
  cyclesBalanceControl = this.#fb.nonNullable.control(0.8, {
    validators: [Validators.required, Validators.min(0.1)],
  });
  readonly cyclesBalance = toSignal(
    this.cyclesBalanceControl.valueChanges.pipe(
      startWith(this.cyclesBalanceControl.value),
    ),
    {
      requireSync: true,
    },
  );
  // readonly errorMessage = signal<string | null>(null);
  readonly form = this.#fb.nonNullable.group({
    controllers: this.controllersControl,
    cyclesBalance: this.cyclesBalanceControl,
  });

  readonly totalCyclesTC = computed(() => {
    const cyclesBalance = this.cyclesBalance();
    return CANISTER_CREATION_COST_TC + cyclesBalance;
  });

  readonly #cmcService = inject(CyclesMintingCanisterService);
  readonly trillionRatio = computed(() => {
    const rate = this.#cmcService.icpXdrConversionRate.value();
    return rate ? Number(rate) / 1_000_000_000_000 : 0;
  });
  readonly totalCostICP = computed(() => {
    const totalTC = this.totalCyclesTC();
    const ratio = this.trillionRatio();
    return ratio > 0 ? (totalTC / ratio).toFixed(2) : '0.00';
  });

  readonly #ledgerService = inject(ICPLedgerService);

  readonly walletBalance = computed(() => this.#ledgerService.balance.value());

  readonly walletBalanceICP = computed(() => {
    const balance = this.walletBalance();
    return (Number(balance) / Number(E8S_PER_ICP)).toFixed(2);
  });

  readonly insufficientBalance = computed(() => {
    const totalCost = parseFloat(this.totalCostICP());
    const balance = parseFloat(this.walletBalanceICP());
    return totalCost > balance;
  });

  #state = signal<State>({ status: 'idle' });
  readonly state = this.#state.asReadonly();
  readonly #canistersService = inject(CanistersService);
  readonly #cmcCanister = injectCyclesMintingCanister();

  readonly #cmcCanisterId = inject(CYCLES_MINTING_CANISTER_ID_TOKEN);
  readonly #httpAgentOptions = inject(HTTP_AGENT_OPTIONS_TOKEN);
  readonly #devIcManagement = computed(() => {
    const agent = HttpAgent.createSync(this.#httpAgentOptions);
    return IcManagementCanister.create({ agent });
  });
  readonly #dialogRef = inject(BrnDialogRef<boolean | undefined>);
  readonly #router = inject(Router);

  protected _handleTryAgain() {
    this.#state.set({ status: 'idle' });
  }

  protected async _onCreate() {
    if (
      this.form.invalid ||
      this.insufficientBalance() ||
      this.#state().status === 'loading'
    ) {
      return;
    }

    try {
      let canisterId: Principal;
      if (isDevMode()) {
        this.#state.set({ status: 'loading', step: 'creating-canister' });
        canisterId = await this.#devCreateCanister();
      } else {
        this.#state.set({ status: 'loading', step: 'transferring-icp' });
        // Step 1: Transfer ICP to CMC
        const blockIndex = await this.#transferICP();
        // Step 2: Notify CMC to create canister
        this.#state.set({ status: 'loading', step: 'creating-canister' });
        canisterId = await this.#createCanister(blockIndex);
      }

      // Step 3: Link canister to user
      this.#state.set({ status: 'loading', step: 'linking-canister' });
      await this.#canistersService.addCanister(canisterId);

      this.#state.set({ status: 'success', canisterId: canisterId.toText() });
      toast.success('Canister created successfully!');
    } catch (error) {
      const errorMessage =
        parseCanisterRejectError(error) ?? 'An error has occurred';
      this.#state.set({ status: 'error', errorMessage });
      toast.error(`Failed to create canister: ${errorMessage}`);
      console.error(error);
    }
  }

  protected _onCreateAnother() {
    this.form.reset({
      controllers: [this.currentUserPrincipal()],
      cyclesBalance: 0.8,
    });
    this.form.controls.controllers.setValue([this.currentUserPrincipal()]);
    this.form.controls.cyclesBalance.setValue(0.8);
    this.#state.set({ status: 'idle' });
  }

  protected _onViewCanister(canisterId: string) {
    this.#dialogRef.close(true);
    // Navigate to canister detail page
    this.#router.navigate(['/canisters', canisterId]);
  }

  #createCanister(blockIndex: bigint) {
    const cmc = this.#cmcCanister();
    const controllers = this.form.controls.controllers.value;
    const currentUserPrincipal = this.currentUserPrincipal();

    if (!controllers || controllers.length === 0) {
      throw new Error('Controllers are required');
    }

    // If there are additional controllers besides the current user, create settings
    // According to IC spec, if settings is not provided, only the controller field is used
    // and other settings use defaults. We only need to provide controllers if there are additional ones.
    const hasAdditionalControllers =
      controllers.length > 1 ||
      !controllers.some((p) => p.toText() === currentUserPrincipal.toText());

    // According to IC spec, all fields in CanisterSettings are optional (opt)
    // In Candid, opt means [] | [value], so each field must be [] or [value]
    // We only provide controllers, all other fields are [] (not set, will use defaults)
    return cmc.notifyCreateCanister({
      block_index: blockIndex,
      controller: currentUserPrincipal,
      settings: hasAdditionalControllers
        ? toNullable({
            controllers: [controllers],
            freezing_threshold: [],
            wasm_memory_threshold: [],
            environment_variables: [],
            reserved_cycles_limit: [],
            log_visibility: [],
            log_memory_limit: [],
            wasm_memory_limit: [],
            memory_allocation: [],
            compute_allocation: [],
          })
        : [],
      subnet_selection: [],
      subnet_type: [],
    });
  }

  #devCreateCanister() {
    const icManagement = this.#devIcManagement();
    const cyclesBalance = this.cyclesBalance();
    console.log('cyclesBalance', cyclesBalance);
    const amountE8s = (BigInt(cyclesBalance * 10) * ONE_TRILLION) / 10n;
    return icManagement.provisionalCreateCanisterWithCycles({
      amount: amountE8s,
      canisterId: generateRandomCanisterId(),
      settings: {
        controllers: this.form.controls.controllers.value.map((p) =>
          p.toText(),
        ),
      },
    });
  }

  #transferICP() {
    const currentUserPrincipal = this.currentUserPrincipal();
    const principalSubaccount = principalToSubAccount(currentUserPrincipal);

    const totalCost = parseFloat(this.totalCostICP());
    const amountE8s = BigInt(Math.ceil(totalCost * Number(E8S_PER_ICP)));

    return this.#ledgerService.transfer({
      to: this.#cmcCanisterId.toText(),
      amount: amountE8s,
      memo: MEMO_CANISTER_CREATE,
      subaccount: principalSubaccount,
    });
  }
}
