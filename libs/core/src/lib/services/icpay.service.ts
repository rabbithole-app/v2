import {
  DestroyRef,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Icpay } from '@ic-pay/icpay-sdk';
import { Actor } from '@icp-sdk/core/agent';
import { filter, firstValueFrom, map, of, timeout } from 'rxjs';

import { AUTH_SERVICE } from '@rabbithole/auth';

import {
  PRO_MONTHLY_PRICE_USD,
  STARTER_VAULT_PROMO_PRICE_USD,
} from '../constants/pricing';
import { injectHttpAgent } from '../injectors/http-agent';
import { ICPAY_CONFIG_TOKEN } from '../tokens/main';

export interface PaymentResult {
  error?: string;
  status: PaymentStatus;
  transactionId?: string;
}

export type PaymentStatus = 'completed' | 'created' | 'error' | 'failed' | 'idle';

@Injectable({ providedIn: 'root' })
export class IcpayService {
  lastPaymentResult = signal<PaymentResult | null>(null);
  paymentStatus = signal<PaymentStatus>('idle');
  #agent = injectHttpAgent();
  #authService = inject(AUTH_SERVICE);

  #config = inject(ICPAY_CONFIG_TOKEN);
  #destroyRef = inject(DestroyRef);
  #icpay: Icpay | null = null;

  readonly #paymentStatus$ = toObservable(this.paymentStatus);
  #unsubscribers: (() => void)[] = [];

  /**
   * Pay for a Starter Vault at the current launch promo price.
   * Backend webhook expects: { purpose: "license", userId, storageBackendType, vetKeyLevel }
   */
  async payLicense(config: {
    storageBackendType: string;
    vetKeyLevel: string;
  }): Promise<PaymentResult> {
    const userId = this.#authService.identity().getPrincipal().toText();
    return this.#pay(STARTER_VAULT_PROMO_PRICE_USD, {
      purpose: 'license',
      userId,
      storageBackendType: config.storageBackendType,
      vetKeyLevel: config.vetKeyLevel,
    });
  }

  /**
   * Pay for Pro subscription.
   * Backend webhook expects: { purpose: "pro_monthly", userId: "<principal>" }
   */
  async payProSubscription(): Promise<PaymentResult> {
    const userId = this.#authService.identity().getPrincipal().toText();
    return this.#pay(PRO_MONTHLY_PRICE_USD, { purpose: 'pro_monthly', userId });
  }

  reset(): void {
    this.paymentStatus.set('idle');
    this.lastPaymentResult.set(null);
  }

  #ensureInitialized(): void {
    if (this.#icpay) return;

    const agent = this.#agent();
    const principal = this.#authService.identity().getPrincipal().toText();

    this.#icpay = new Icpay({
      publishableKey: this.#config.publishableKey,
      apiUrl: this.#config.apiUrl,
      connectedWallet: { owner: principal },
      actorProvider: (canisterId, idl) =>
        Actor.createActor(idl, { agent, canisterId }),
      enableEvents: true,
    });

    this.#unsubscribers.push(
      this.#icpay.on('icpay-sdk-transaction-completed', (detail) => {
        this.paymentStatus.set('completed');
        this.lastPaymentResult.set({
          status: 'completed',
          transactionId: detail?.transactionId ?? detail?.paymentId,
        });
      }),
    );

    this.#unsubscribers.push(
      this.#icpay.on('icpay-sdk-transaction-failed', (detail) => {
        this.paymentStatus.set('failed');
        this.lastPaymentResult.set({
          status: 'failed',
          error: detail?.error ?? 'Payment failed',
        });
      }),
    );

    this.#unsubscribers.push(
      this.#icpay.on('icpay-sdk-error', (detail) => {
        this.paymentStatus.set('error');
        this.lastPaymentResult.set({
          status: 'error',
          error: detail?.message ?? 'An error occurred',
        });
      }),
    );

    this.#unsubscribers.push(
      this.#icpay.on('icpay-sdk-transaction-created', () => {
        this.paymentStatus.set('created');
      }),
    );

    this.#destroyRef.onDestroy(() => {
      this.#unsubscribers.forEach((fn) => fn());
    });
  }

  async #pay(
    usdAmount: number,
    metadata: Record<string, unknown>,
  ): Promise<PaymentResult> {
    this.#ensureInitialized();

    if (!this.#icpay) {
      return { status: 'error', error: 'ICPay SDK could not be initialized.' };
    }

    this.paymentStatus.set('idle');
    this.lastPaymentResult.set(null);

    try {
      await this.#icpay.createPaymentUsd({ usdAmount, metadata });

      return firstValueFrom(
        this.#paymentStatus$.pipe(
          filter((status) => status === 'completed' || status === 'failed' || status === 'error'),
          map((): PaymentResult =>
            this.lastPaymentResult() ?? {
              status: 'error',
              error: 'Payment status changed without a result.',
            },
          ),
          timeout({
            first: 600_000,
            with: () => {
              const result: PaymentResult = { status: 'error', error: 'Payment timed out' };
              this.paymentStatus.set('error');
              this.lastPaymentResult.set(result);
              return of(result);
            },
          }),
        ),
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Payment failed';
      const result: PaymentResult = { status: 'error', error: errorMsg };
      this.paymentStatus.set('error');
      this.lastPaymentResult.set(result);
      return result;
    }
  }
}
