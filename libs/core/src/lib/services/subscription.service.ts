import { computed, inject, Injectable, resource } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { fromNullable } from '@dfinity/utils';
import { Actor } from '@icp-sdk/core/agent';
import { toast } from '@spartan-ng/brain/sonner';
import { catchError, map, of } from 'rxjs';
import { match, P } from 'ts-pattern';

import type { Plan, Subscription } from '@rabbithole/declarations/backend';

import { injectMainActor } from '../injectors/main-actor';
import { BACKEND_FEATURES_ENABLED_TOKEN } from '../tokens/backend-features';
import { parseCanisterRejectError } from '../utils/parse-canister-reject-error';

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  #actor = injectMainActor();
  #backendFeaturesEnabled = inject(BACKEND_FEATURES_ENABLED_TOKEN);

  #subscriptionResource = resource({
    params: () => ({
      actor: this.#actor(),
      enabled: this.#backendFeaturesEnabled,
    }),
    loader: async ({ params: { actor, enabled } }) => {
      if (!enabled) return null;

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

  expiresAt = computed(() => {
    const sub = this.subscription();
    if (!sub?.expiresAt?.[0]) return null;
    return Number(sub.expiresAt[0]) / 1_000_000; // ns → ms
  });

  plan = computed(() => this.subscription()?.plan ?? null);
  hasProPlan = computed(() => {
    const p = this.plan();
    return p !== null && 'Pro' in p;
  });

  status = computed(() => this.subscription()?.status ?? null);

  isActive = computed(() => {
    const s = this.status();
    return s !== null && 'Active' in s;
  });

  isActivePro = computed(() => this.hasProPlan() && this.isActive());

  isExpired = computed(() => {
    const s = this.status();
    return s !== null && 'Expired' in s;
  });
  isExpiredPro = computed(() => this.hasProPlan() && this.isExpired());

  isPro = this.isActivePro;

  ready$ = toObservable(this.#subscriptionResource.value).pipe(
    map((v) => v !== undefined),
    catchError(() => of(true)),
  );

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
