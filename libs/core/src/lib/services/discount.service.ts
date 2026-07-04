import { computed, inject, Injectable, resource } from '@angular/core';
import { fromNullable } from '@dfinity/utils';
import { Actor } from '@icp-sdk/core/agent';

import type { DiscountState } from '@rabbithole/declarations/backend';

import { injectMainActor } from '../injectors/main-actor';
import { BACKEND_FEATURES_ENABLED_TOKEN } from '../tokens/backend-features';
import {
  applyReferralCodeErrorMessage,
  formatDiscountPercent,
  isBenignReferralError,
} from '../utils/referral';

const DEFAULT_REFERRAL_DISCOUNT_BPS = 1000n;

export type ApplyPromoResult =
  | { message: string; ok: false; }
  | { message: string; ok: true; tone: 'info' | 'success'; };

/**
 * Shared discount state for a user: the coupon-granted discount and its usage
 * flags. Lives in core so both core payment components (pro-upgrade-flow) and
 * feature surfaces (create-storage-dialog, ambassador page) can read it.
 */
@Injectable({ providedIn: 'root' })
export class DiscountService {
  #actor = injectMainActor();
  #backendFeaturesEnabled = inject(BACKEND_FEATURES_ENABLED_TOKEN);

  #discountResource = resource({
    params: () => ({
      actor: this.#actor(),
      enabled: this.#backendFeaturesEnabled,
    }),
    loader: async ({ params: { actor, enabled } }) => {
      if (!enabled) return null;

      const agent = Actor.agentOf(actor);
      const principal = await agent?.getPrincipal();
      if (principal?.isAnonymous()) return undefined;

      return fromNullable(await actor.getMyDiscountState()) ?? null;
    },
  });

  discountState = computed<DiscountState | null | undefined>(() => {
    if (this.#discountResource.error() !== undefined) return undefined;
    return this.#discountResource.value();
  });

  #referralBpsResource = resource({
    params: () => ({
      actor: this.#actor(),
      enabled: this.#backendFeaturesEnabled,
    }),
    loader: async ({ params: { actor, enabled } }) => {
      if (!enabled) return DEFAULT_REFERRAL_DISCOUNT_BPS;
      return actor.getReferralDiscountBps();
    },
  });

  referralDiscountBps = computed(
    () => this.#referralBpsResource.value() ?? DEFAULT_REFERRAL_DISCOUNT_BPS,
  );

  async applyPromoCode(code: string): Promise<ApplyPromoResult> {
    const trimmed = code.trim();
    if (!trimmed) return { ok: false, message: 'Enter a code.' };

    const result = await this.#actor().applyReferralCode(trimmed);
    if ('ok' in result) {
      this.#discountResource.reload();
      const state = fromNullable(await this.#actor().getMyDiscountState());
      return {
        ok: true,
        tone: 'success',
        message: state
          ? `Referral code applied — ${formatDiscountPercent(state.discountBps)} off your first payments.`
          : 'Referral link applied — you are now connected to your inviter.',
      };
    }

    if (isBenignReferralError(result)) {
      return { ok: true, tone: 'info', message: applyReferralCodeErrorMessage(result) };
    }

    return { ok: false, message: applyReferralCodeErrorMessage(result) };
  }
}
