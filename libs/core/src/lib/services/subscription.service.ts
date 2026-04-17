import { computed, Injectable, resource } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { fromNullable } from '@dfinity/utils';
import { Actor } from '@icp-sdk/core/agent';
import { toast } from 'ngx-sonner';
import { catchError, map, of } from 'rxjs';
import { match, P } from 'ts-pattern';

import type { Plan, Subscription } from '@rabbithole/declarations';

import { injectMainActor } from '../injectors';
import { parseCanisterRejectError } from '../utils';

const TRIAL_LIMIT_BYTES = 100_000_000; // 100 MB

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  #actor = injectMainActor();

  #subscriptionResource = resource({
    params: () => this.#actor(),
    loader: async ({ params: actor }) => {
      const agent = Actor.agentOf(actor);
      const principal = await agent?.getPrincipal();
      if (principal?.isAnonymous()) return undefined;

      const sub = await actor.getSubscription();
      return fromNullable(sub) ?? null;
    },
  });

  subscription = computed<Subscription | null | undefined>(() => {
    if (this.#subscriptionResource.error() !== undefined) return undefined;
    return this.#subscriptionResource.value();
  });

  autoRenew = computed(() => this.subscription()?.autoRenew ?? false);

  expiresAt = computed(() => {
    const sub = this.subscription();
    if (!sub?.expiresAt?.[0]) return null;
    return Number(sub.expiresAt[0]) / 1_000_000; // ns → ms
  });

  status = computed(() => this.subscription()?.status ?? null);
  isActive = computed(() => {
    const s = this.status();
    return s !== null && 'Active' in s;
  });

  isExpired = computed(() => {
    const s = this.status();
    return s !== null && 'Expired' in s;
  });

  plan = computed(() => this.subscription()?.plan ?? null);

  isLicense = computed(() => {
    const p = this.plan();
    return p !== null && 'License' in p;
  });

  isPro = computed(() => {
    const p = this.plan();
    return p !== null && 'Pro' in p;
  });

  isTrial = computed(() => {
    const p = this.plan();
    return p !== null && 'Trial' in p;
  });

  ready$ = toObservable(this.#subscriptionResource.value).pipe(
    map((v) => v !== undefined),
    catchError(() => of(true)),
  );

  trialDaysLeft = computed(() => {
    const expires = this.expiresAt();
    if (!expires || !this.isTrial()) return null;
    const diff = expires - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  });

  trialUsedBytes = computed(() =>
    Number(this.subscription()?.trialUsedBytes ?? 0n),
  );

  trialProgress = computed(() => this.trialUsedBytes() / TRIAL_LIMIT_BYTES);

  trialRemainingBytes = computed(
    () => TRIAL_LIMIT_BYTES - this.trialUsedBytes(),
  );

  async activateTrial(): Promise<void> {
    const id = toast.loading('Activating trial...');
    const actor = this.#actor();

    try {
      await actor.activateTrial();
      toast.success('Pro trial activated! 14 days + 100 MB encryption', { id });
      this.#subscriptionResource.reload();
    } catch (error) {
      const errorMessage = parseCanisterRejectError(error) ?? 'An error has occurred';
      toast.error(`Failed to activate trial: ${errorMessage}`, { id });
      throw error;
    }
  }

  async purchaseSubscription(plan: Plan): Promise<boolean> {
    const id = toast.loading('Processing subscription...');
    const actor = this.#actor();

    try {
      const result = await actor.purchaseSubscription(plan);

      if ('ok' in result) {
        toast.success('Subscription activated!', { id });
        this.#subscriptionResource.reload();
        return true;
      }

      const errorMsg = match(result.err)
        .with({ AlreadyActive: P.any }, () => 'You already have an active subscription')
        .with({ InsufficientFunds: P.select() }, (e) => `Insufficient balance. Required: $${(Number(e.required) / 100).toFixed(2)}`)
        .with({ InvalidPlan: P.select() }, (msg) => `Invalid plan: ${msg}`)
        .with({ ChargeFailed: P.select() }, (msg) => `Payment failed: ${msg}`)
        .with({ ActivationFailed: P.select() }, (msg) => `Activation failed: ${msg}`)
        .exhaustive();

      toast.error(errorMsg, { id });
      return false;
    } catch (error) {
      const errorMessage = parseCanisterRejectError(error) ?? 'An error has occurred';
      toast.error(`Purchase failed: ${errorMessage}`, { id });
      throw error;
    }
  }

  reload(): void {
    this.#subscriptionResource.reload();
  }
}
