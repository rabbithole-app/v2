import {
  ChangeDetectionStrategy,
  Component,
  computed,
  CUSTOM_ELEMENTS_SCHEMA,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import '@ic-pay/icpay-widget';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideArrowRight,
  lucideCheck,
  lucideCircleAlert,
  lucideCloud,
  lucideCreditCard,
  lucideDatabase,
  lucideExternalLink,
  lucideLock,
  lucidePlus,
  lucideShield,
  lucideShieldCheck,
} from '@ng-icons/lucide';
import { BrnDialogRef } from '@spartan-ng/brain/dialog';
import { toast } from 'ngx-sonner';

import {
  CopyToClipboardComponent,
  formatUsd,
  ICPAY_CONFIG_TOKEN,
  injectMainActor,
  LICENSE_PRICE_USD,
  parseCanisterRejectError,
  type StorageBackendType,
  StoragesService,
  WalletBalancePanelComponent,
} from '@rabbithole/core';
import { AUTH_SERVICE } from '@rabbithole/auth';
import type { StorageBackendType as CandidStorageBackendType } from '@rabbithole/declarations';
import {
  ProcessStepListComponent,
  RbthFrameComponent,
  RbthFrameDescriptionDirective,
  RbthFrameHeaderDirective,
  RbthFramePanelDirective,
  RbthFrameTitleDirective,
} from '@rabbithole/ui';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from '@spartan-ng/helm/dialog';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmRadioGroup, HlmRadioGroupImports } from '@spartan-ng/helm/radio-group';
import { EmptyError, filter, firstValueFrom, map, of, switchMap, take, tap, timeout, timer } from 'rxjs';

import { buildCreationSteps } from '../../utils';

export type VetKeyLevel = 'high-replication' | 'standard';

type WizardStep = 'configure' | 'creating' | 'error' | 'payment';

@Component({
  selector: 'rbth-feat-storages-create-storage-dialog',
  imports: [
    NgIcon,
    HlmIcon,
    HlmDialogHeader,
    HlmDialogFooter,
    HlmDialogTitle,
    HlmDialogDescription,
    ...HlmAlertImports,
    ...HlmButtonImports,
    ...HlmFieldImports,
    HlmRadioGroup,
    ...HlmRadioGroupImports,
    CopyToClipboardComponent,
    ProcessStepListComponent,
    WalletBalancePanelComponent,
    RbthFrameComponent,
    RbthFrameDescriptionDirective,
    RbthFrameHeaderDirective,
    RbthFramePanelDirective,
    RbthFrameTitleDirective,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideArrowRight,
      lucideCheck,
      lucideCircleAlert,
      lucideCloud,
      lucideCreditCard,
      lucideDatabase,
      lucideExternalLink,
      lucideLock,
      lucidePlus,
      lucideShield,
      lucideShieldCheck,
    }),
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './create-storage-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-completed]': 'isCompleted()',
    '[attr.data-step]': 'step()',
  },
})
export class CreateStorageDialogComponent {
  // ═══════════════════════════════════════════════════════════════
  // CONSTANTS (exposed to template)
  // ═══════════════════════════════════════════════════════════════

  readonly LICENSE_PRICE_USD = LICENSE_PRICE_USD;
  readonly licensePriceLabel = formatUsd(LICENSE_PRICE_USD);
  readonly payFromBalanceLabel = `Pay ${formatUsd(LICENSE_PRICE_USD)} from balance`;

  // ═══════════════════════════════════════════════════════════════
  // WIZARD STATE
  // ═══════════════════════════════════════════════════════════════

  readonly #createdCanisterId = signal<string | null>(null);
  readonly createdCanisterId = this.#createdCanisterId.asReadonly();

  readonly #storagesService = inject(StoragesService);
  readonly creationStatus = computed(() => this.#storagesService.creationStatus());

  /**
   * Maps the live `creationStatus` + known canister id into a 5-step list
   * consumed by `rbth-process-steps`. See buildCreationSteps for the exact
   * mapping rules — including how it expands `#ProcessingPayment(phase)` into
   * the "Payment" step's description so users see "Charging 0.054 SOL..."
   * instead of a static label.
   */
  readonly creationSteps = computed(() => {
    const status = this.creationStatus();
    const canisterIdText = this.#createdCanisterId();
    return buildCreationSteps(
      status,
      canisterIdText !== null,
      canisterIdText ?? undefined,
    );
  });

  readonly creationProgressLabel = computed(() => {
    const steps = this.creationSteps();
    const total = steps.length;
    const completed = steps.filter((step) => step.status === 'completed').length;
    const active = steps.find((step) => step.status === 'in-progress');
    const failed = steps.find((step) => step.status === 'error');

    if (failed) {
      return `Step ${Math.min(completed + 1, total)} of ${total} — ${failed.error ?? failed.title}`;
    }

    if (completed === total) {
      return `Completed ${total} of ${total} steps`;
    }

    return `Step ${completed + 1} of ${total}${active?.description ? ' — ' + active.description : ''}`;
  });

  readonly #step = signal<WizardStep>('configure');
  readonly step = this.#step.asReadonly();
  readonly isCompleted = computed(() =>
    this.step() === 'creating' && this.creationStatus()?.type === 'Completed',
  );

  readonly dialogTitle = computed(() => {
    switch (this.step()) {
      case 'configure': return 'Create Storage';
      case 'creating':
        return this.creationStatus()?.type === 'Completed'
          ? 'Create Storage'
          : 'Deploying your storage canister';
      case 'error': return 'Something Went Wrong';
      case 'payment': return `Pay from balance — ${this.licensePriceLabel}`;
    }
  });

  readonly #errorMessage = signal<string | null>(null);
  readonly errorMessage = this.#errorMessage.asReadonly();

  // ═══════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════

  readonly #storageBackend = signal<StorageBackendType>('BlobStorage');
  readonly storageBackend = this.#storageBackend.asReadonly();

  readonly #vetKeyLevel = signal<VetKeyLevel>('standard');
  readonly vetKeyLevel = this.#vetKeyLevel.asReadonly();

  // ═══════════════════════════════════════════════════════════════
  // SERVICES
  // ═══════════════════════════════════════════════════════════════

  readonly icpayPayBtn = viewChild<ElementRef<HTMLElement>>('icpayPayBtn');
  readonly balancePaymentPanel = viewChild(WalletBalancePanelComponent);

  readonly #actor = injectMainActor();
  readonly #authService = inject(AUTH_SERVICE);
  readonly #destroyRef = inject(DestroyRef);
  readonly #icpayConfig = inject(ICPAY_CONFIG_TOKEN);
  readonly #router = inject(Router);
  readonly #dialogRef = inject(BrnDialogRef);

  constructor() {
    // Configure ICPay widget reactively when the element appears
    effect(() => {
      const btn = this.icpayPayBtn()?.nativeElement;
      if (!btn) return;

      const vetKeyName = this.vetKeyLevel() === 'standard' ? 'test_key_1' : 'key_1';
      (btn as unknown as { config: unknown }).config = {
        ...this.#icpayConfig,
        amountUsd: LICENSE_PRICE_USD,
        buttonLabel: `Pay ${formatUsd(LICENSE_PRICE_USD)} with crypto`,
        metadata: {
          purpose: 'license',
          storageBackendType: this.storageBackend(),
          vetKeyName,
          userId: this.#authService.principalId(),
        },
        onSuccess: () => this.#onIcpaySuccess(),
      };
    });

    effect(() => {
      const status = this.creationStatus();
      const currentStep = untracked(() => this.step());
      const alreadyCompleted = untracked(() => this.#createdCanisterId()) !== null;
      const alreadyFailed = untracked(() => this.#errorMessage()) !== null;

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
  // DIALOG API
  // ═══════════════════════════════════════════════════════════════

  close(): void {
    this.#dialogRef.close();
  }

  createAnother(): void {
    this.#storagesService.clearTrackedCreation();
    this.#step.set('configure');
    this.#errorMessage.set(null);
    this.#createdCanisterId.set(null);
    this.#storageBackend.set('BlobStorage');
    this.#vetKeyLevel.set('standard');
  }

  // ═══════════════════════════════════════════════════════════════
  // NAVIGATION
  // ═══════════════════════════════════════════════════════════════

  goBackToConfigure(): void {
    this.#step.set('configure');
  }

  goToPayment(): void {
    this.#step.set('payment');
  }

  tryAgain(): void {
    this.#step.set('payment');
    this.#errorMessage.set(null);
  }

  /**
   * Called when the user clicks Retry on a failed step inside
   * `rbth-process-steps`. Forwards to `tryAgain` — same semantics as the
   * legacy Error-state "Try Again" button.
   */
  retryFromError(): void {
    this.tryAgain();
  }

  viewStorage(): void {
    const canisterId = this.createdCanisterId();
    if (!canisterId) return;

    this.#storagesService.clearTrackedCreation();
    this.close();
    this.#router.navigate(['/dashboard', canisterId, 'drive']);
  }

  // ═══════════════════════════════════════════════════════════════
  // FORM HANDLERS
  // ═══════════════════════════════════════════════════════════════

  selectStorageBackend(backend: StorageBackendType): void {
    this.#storageBackend.set(backend);
  }

  selectVetKeyLevel(level: VetKeyLevel): void {
    this.#vetKeyLevel.set(level);
  }

  // ═══════════════════════════════════════════════════════════════
  // PAYMENT ACTIONS
  // ═══════════════════════════════════════════════════════════════

  async purchaseFromBalance(): Promise<void> {
    this.#step.set('creating');

    try {
      const backendType: CandidStorageBackendType = this.storageBackend() === 'OnChain'
        ? { OnChain: null }
        : { BlobStorage: null };
      const vetKeyName = this.vetKeyLevel() === 'standard' ? 'test_key_1' : 'key_1';
      const result = await this.#actor().purchaseLicenseAndCreateStorage(
        backendType,
        [[{ name: 'VETKEY_NAME', value: vetKeyName }]],
      );
      if ('ok' in result) {
        // Backend returns creationId immediately — register it so the
        // service tracks THIS record through every status transition
        // (ProcessingPayment phases → Pending → CheckingBalance → ...).
        this.#storagesService.trackCreation(result.ok);
        await this.#pollForStorageCreation();
      } else {
        const errKey = Object.keys(result.err)[0];
        const errVal = (result.err as Record<string, unknown>)[errKey];
        const detail = typeof errVal === 'string' ? errVal : '';
        this.#errorMessage.set(`${errKey}${detail ? ': ' + detail : ''}`);
        this.#step.set('error');
      }
    } catch (error) {
      const msg = parseCanisterRejectError(error) ?? 'Payment failed';
      this.#errorMessage.set(msg);
      this.#step.set('error');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE
  // ═══════════════════════════════════════════════════════════════

  async #onIcpaySuccess(): Promise<void> {
    this.#step.set('creating');
    // ICPay route doesn't hand us the creationId — fall back to scanning
    // the storages list; the first in-progress record is treated as ours.
    await this.#pollForStorageCreation();
  }

  async #pollForStorageCreation(): Promise<void> {
    this.#step.set('creating');
    const storagesBefore = this.#storagesService.storagesResource.value()?.length ?? 0;

    try {
      const result = await firstValueFrom(
        timer(5000, 7000).pipe(
          tap(() => this.#storagesService.storagesResource.reload()),
          switchMap(() =>
            timer(2000).pipe(
              map(() => {
                const current = this.#storagesService.storagesResource.value() ?? [];
                if (current.length <= storagesBefore) return null;
                return current[current.length - 1]?.canisterId?.toText() ?? null;
              }),
            ),
          ),
          filter((id): id is string => id !== null),
          take(1),
          map((canisterId) => ({ canisterId, type: 'created' as const })),
          timeout({
            first: 840_000,
            with: () => of({ type: 'timeout' as const }),
          }),
          takeUntilDestroyed(this.#destroyRef),
        ),
      );

      if (result.type === 'created') {
        this.#createdCanisterId.set(result.canisterId);
        toast.success('Storage created successfully!');
        return;
      }

      this.#errorMessage.set('Storage creation timed out. If you paid, check back in a few minutes.');
      this.#step.set('error');
    } catch (error) {
      if (error instanceof EmptyError) return;
      throw error;
    }
  }
}
