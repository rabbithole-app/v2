import {
  DestroyRef,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { Icpay } from '@ic-pay/icpay-sdk';
import { Actor } from '@icp-sdk/core/agent';

import { AUTH_SERVICE } from '@rabbithole/auth';

import { injectHttpAgent } from '../injectors';
import { ICPAY_CONFIG_TOKEN } from '../tokens/main';

export type PaymentStatus = 'completed' | 'created' | 'error' | 'failed' | 'idle';

export interface PaymentResult {
  error?: string;
  status: PaymentStatus;
  transactionId?: string;
}

@Injectable({ providedIn: 'root' })
export class IcpayService {
  #agent = injectHttpAgent();
  #authService = inject(AUTH_SERVICE);
  #config = inject(ICPAY_CONFIG_TOKEN);
  #destroyRef = inject(DestroyRef);

  paymentStatus = signal<PaymentStatus>('idle');
  lastPaymentResult = signal<PaymentResult | null>(null);

  #icpay: Icpay | null = null;
  #unsubscribers: (() => void)[] = [];

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

  /**
   * Pay for a Storage License ($4.90).
   * Backend webhook expects: { purpose: "license", userId, storageBackendType, vetKeyName }
   */
  async payLicense(config: {
    storageBackendType: string;
    vetKeyName: string;
  }): Promise<PaymentResult> {
    const userId = this.#authService.identity().getPrincipal().toText();
    return this.#pay(4.90, {
      purpose: 'license',
      userId,
      storageBackendType: config.storageBackendType,
      vetKeyName: config.vetKeyName,
    });
  }

  /**
   * Pay for Pro subscription ($9.90/month).
   * Backend webhook expects: { purpose: "pro_monthly", userId: "<principal>" }
   */
  async payProSubscription(): Promise<PaymentResult> {
    const userId = this.#authService.identity().getPrincipal().toText();
    return this.#pay(9.90, { purpose: 'pro_monthly', userId });
  }

  reset(): void {
    this.paymentStatus.set('idle');
    this.lastPaymentResult.set(null);
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

      // Wait for SDK event to resolve payment status
      return new Promise<PaymentResult>((resolve) => {
        const checkInterval = setInterval(() => {
          const status = this.paymentStatus();
          if (status === 'completed' || status === 'failed' || status === 'error') {
            clearInterval(checkInterval);
            resolve(this.lastPaymentResult()!);
          }
        }, 500);

        // 10 minute timeout
        setTimeout(() => {
          clearInterval(checkInterval);
          if (this.paymentStatus() === 'idle' || this.paymentStatus() === 'created') {
            const result: PaymentResult = { status: 'error', error: 'Payment timed out' };
            this.paymentStatus.set('error');
            this.lastPaymentResult.set(result);
            resolve(result);
          }
        }, 600_000);
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Payment failed';
      const result: PaymentResult = { status: 'error', error: errorMsg };
      this.paymentStatus.set('error');
      this.lastPaymentResult.set(result);
      return result;
    }
  }
}
