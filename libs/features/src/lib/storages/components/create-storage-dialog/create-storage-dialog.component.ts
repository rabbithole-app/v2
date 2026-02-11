import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormField, form, required, validate } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { Principal } from '@icp-sdk/core/principal';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideCheck,
  lucideCircleAlert,
  lucideExternalLink,
  lucideHardDrive,
  lucideLink,
  lucidePlus,
  lucideRocket,
} from '@ng-icons/lucide';
import { BrnDialogClose, BrnDialogRef } from '@spartan-ng/brain/dialog';
import { toast } from 'ngx-sonner';

import { AUTH_SERVICE } from '@rabbithole/auth';
import {
  CopyToClipboardComponent,
  CyclesMintingCanisterService,
  E8S_PER_ICP,
  encodeStorageInitArgs,
  ICPLedgerService,
  IS_PRODUCTION_TOKEN,
  isPrincipal,
  MAIN_CANISTER_ID_TOKEN,
  parseCanisterRejectError,
} from '@rabbithole/core';
import { type TargetCanister } from '@rabbithole/declarations';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from '@spartan-ng/helm/dialog';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmRadioGroup, HlmRadioGroupImports } from '@spartan-ng/helm/radio-group';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

import { CyclesBalanceInputComponent } from '../../../canisters/components';
import { StoragesService } from '../../services';
import { StorageCreationProgressComponent } from '../storage-creation-progress/storage-creation-progress.component';

type DeploymentMode = 'existing' | 'new';
type WizardStep = 'configure' | 'creating' | 'error' | 'select-mode';

const CANISTER_CREATION_COST_TC = 0.5;

interface ExistingCanisterFormModel {
  canisterId: string;
}

interface NewCanisterFormModel {
  cyclesBalance: number;
}

@Component({
  selector: 'rbth-feat-storages-create-storage-dialog',
  standalone: true,
  imports: [
    FormField,
    FormsModule,
    NgTemplateOutlet,
    NgIcon,
    HlmIcon,
    HlmSpinner,
    HlmDialogHeader,
    HlmDialogFooter,
    HlmDialogTitle,
    HlmDialogDescription,
    BrnDialogClose,
    ...HlmAlertImports,
    ...HlmButtonImports,
    ...HlmEmptyImports,
    ...HlmFieldImports,
    HlmRadioGroup,
    ...HlmRadioGroupImports,
    HlmInput,
    CopyToClipboardComponent,
    CyclesBalanceInputComponent,
    StorageCreationProgressComponent,
  ],
  providers: [
    ICPLedgerService,
    provideIcons({
      lucideArrowLeft,
      lucideCheck,
      lucideCircleAlert,
      lucideExternalLink,
      lucideHardDrive,
      lucideLink,
      lucidePlus,
      lucideRocket,
    }),
  ],
  templateUrl: './create-storage-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateStorageDialogComponent {
  readonly backendCanisterId = inject(MAIN_CANISTER_ID_TOKEN);
  readonly CANISTER_CREATION_COST_TC = CANISTER_CREATION_COST_TC;
  readonly existingFormModel = signal<ExistingCanisterFormModel>({
    canisterId: '',
  });
  readonly existingForm = form(this.existingFormModel, (schema) => {
    required(schema.canisterId, { message: 'Canister ID is required' });
    validate(schema.canisterId, ({ value }) => {
      const v = value();
      if (v && !isPrincipal(v)) {
        return { kind: 'invalidPrincipal', message: 'Invalid canister ID format' };
      }
      return null;
    });
  });
  readonly canisterIdError = computed(() => {
    const field = this.existingForm.canisterId();
    if (!field.touched()) return null;
    const value = field.value();
    if (!value) return 'Canister ID is required';
    if (!isPrincipal(value)) return 'Invalid canister ID format';
    return null;
  });
  readonly #createdCanisterId = signal<string | null>(null);

  // ═══════════════════════════════════════════════════════════════
  // WIZARD STATE
  // ═══════════════════════════════════════════════════════════════

  readonly createdCanisterId = this.#createdCanisterId.asReadonly();
  readonly #storagesService = inject(StoragesService);

  readonly creationStatus = computed(() => this.#storagesService.creationStatus());
  readonly #deploymentMode = signal<DeploymentMode>('new');
  readonly deploymentMode = this.#deploymentMode.asReadonly();

  readonly #errorMessage = signal<string | null>(null);

  // ═══════════════════════════════════════════════════════════════
  // SIGNAL FORMS: EXISTING CANISTER
  // ═══════════════════════════════════════════════════════════════

  readonly errorMessage = this.#errorMessage.asReadonly();

  // ═══════════════════════════════════════════════════════════════
  // SIGNAL FORMS: NEW CANISTER
  // ═══════════════════════════════════════════════════════════════

  readonly newFormModel = signal<NewCanisterFormModel>({
    cyclesBalance: 0.8,
  });

  readonly totalCyclesTC = computed(() => {
    const cyclesBalance = this.newFormModel().cyclesBalance;
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

  // ═══════════════════════════════════════════════════════════════
  // COMPUTED VALUES
  // ═══════════════════════════════════════════════════════════════

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

  readonly isExistingFormValid = computed(() => {
    const value = this.existingFormModel().canisterId;
    return value.trim() !== '' && isPrincipal(value.trim());
  });

  readonly isNewFormValid = computed(() => {
    const cyclesBalance = this.newFormModel().cyclesBalance;
    return cyclesBalance >= 0.1 && !this.insufficientBalance();
  });
  readonly isFormValid = computed(() => {
    const mode = this.deploymentMode();
    if (mode === 'existing') {
      return this.isExistingFormValid();
    }
    return this.isNewFormValid();
  });
  readonly newForm = form(this.newFormModel, (schema) => {
    required(schema.cyclesBalance, { message: 'Cycles balance is required' });
  });

  readonly #step = signal<WizardStep>('select-mode');

  readonly step = this.#step.asReadonly();

  readonly #authService = inject(AUTH_SERVICE);

  readonly #dialogRef = inject(BrnDialogRef);

  // ═══════════════════════════════════════════════════════════════
  // SERVICES
  // ═══════════════════════════════════════════════════════════════

  readonly #isProduction = inject(IS_PRODUCTION_TOKEN);
  readonly #router = inject(Router);

  constructor() {
    // Watch creation status for completion/failure
    effect(() => {
      const status = this.creationStatus();
      // Read step and other signals with untracked to avoid re-triggering
      const currentStep = untracked(() => this.step());
      const alreadyCompleted = untracked(() => this.#createdCanisterId()) !== null;
      const alreadyFailed = untracked(() => this.#errorMessage()) !== null;

      // Only process if we're in creating step and haven't already handled completion/failure
      if (currentStep === 'creating' && status) {
        if (status.type === 'Completed' && !alreadyCompleted) {
          this.#createdCanisterId.set(status.canisterId.toText());
          toast.success('Storage created successfully!');
        } else if (status.type === 'Failed' && !alreadyFailed) {
          this.#errorMessage.set(status.message);
          this.#step.set('error');
          toast.error(`Storage creation failed: ${status.message}`);
        }
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // WIZARD NAVIGATION
  // ═══════════════════════════════════════════════════════════════

  createAnother(): void {
    this.#storagesService.clearTrackedCreation();
    this.#step.set('select-mode');
    this.#deploymentMode.set('new');
    this.#errorMessage.set(null);
    this.#createdCanisterId.set(null);
    this.existingFormModel.set({ canisterId: '' });
    this.newFormModel.set({ cyclesBalance: 0.8 });
  }

  async createStorage(): Promise<void> {
    if (!this.isFormValid()) {
      return;
    }

    const mode = this.deploymentMode();

    try {
      this.#step.set('creating');
      this.#errorMessage.set(null);

      let target: TargetCanister;

      if (mode === 'existing') {
        const formData = this.existingFormModel();
        const canisterIdText = formData.canisterId.trim();
        target = { Existing: Principal.fromText(canisterIdText) };
      } else {
        // New canister: let backend handle CMC creation
        const initialCycles = BigInt(
          Math.floor(this.totalCyclesTC() * 1_000_000_000_000),
        );
        target = {
          Create: {
            initialCycles,
            subnetId: [],
          },
        };
      }

      // Encode InitArgs with owner and vetKeyName
      const owner = this.#authService.identity().getPrincipal();
      const vetKeyName = this.#isProduction ? 'key_1' : 'dfx_test_key';
      await this.#storagesService.createStorage({
        releaseSelector: { LatestDraft: null },
        initArg: encodeStorageInitArgs({ owner, vetKeyName }),
        target,
      });

      // Polling will update the status via effect
    } catch (error) {
      console.error(error);
      const errorMessage =
        parseCanisterRejectError(error) ?? 'An error has occurred';
      this.#errorMessage.set(errorMessage);
      this.#step.set('error');
      toast.error(`Failed to create storage: ${errorMessage}`);
      console.error(error);
    }
  }

  goBack(): void {
    const currentStep = this.#step();
    if (currentStep === 'configure') {
      this.#step.set('select-mode');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // FORM HANDLERS
  // ═══════════════════════════════════════════════════════════════

  goToNextStep(): void {
    const currentStep = this.#step();
    if (currentStep === 'select-mode') {
      this.#step.set('configure');
    }
  }

  onCyclesBalanceChange(value: number): void {
    this.newFormModel.update((m) => ({ ...m, cyclesBalance: value }));
  }

  selectMode(mode: DeploymentMode | undefined): void {
    if (mode) {
      this.#deploymentMode.set(mode);
    }
  }

  tryAgain(): void {
    this.#step.set('configure');
    this.#errorMessage.set(null);
  }

  viewStorage(): void {
    const canisterId = this.createdCanisterId();
    if (canisterId) {
      this.#dialogRef.close();
      this.#router.navigate(['/', canisterId, 'drive']);
    }
  }
}
