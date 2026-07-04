import { computed, inject, Injectable, resource, signal } from '@angular/core';
import { fromNullable } from '@dfinity/utils';
import { toast } from '@spartan-ng/brain/sonner';
import { match, P } from 'ts-pattern';

import { AUTH_SERVICE } from '@rabbithole/auth';
import {
  DiscountService,
  injectMainActor,
  parseCanisterRejectError,
  ProfileService,
  timeInNanosToDate,
} from '@rabbithole/core';
import { BalanceService } from '@rabbithole/core/wallet';
import type {
  Coupon,
  CreateCouponArgs,
  DistributionRecord,
  InvitedUserItem,
} from '@rabbithole/declarations/backend';

import {
  EarningByToken,
  earningsUsdByPayer,
  filterMyL1Distributions,
  sumEarningsByToken,
  sumEarningsUsd,
  uniquePayerIds,
} from '../utils/earnings';

const INVITED_PAGE_SIZE = 10;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class AmbassadorService {
  readonly #actor = injectMainActor();
  readonly #authService = inject(AUTH_SERVICE);

  readonly #couponsResource = resource({
    params: () => ({
      actor: this.#actor(),
      authenticated: this.#authService.isAuthenticated(),
    }),
    loader: async ({ params: { actor, authenticated } }) => {
      if (!authenticated) return [];
      return actor.getMyCoupons();
    },
  });
  readonly coupons = computed<Coupon[]>(
    () => this.#couponsResource.value() ?? [],
  );
  readonly couponsLoading = computed(() => this.#couponsResource.isLoading());

  readonly #distributionsResource = resource({
    params: () => ({
      actor: this.#actor(),
      authenticated: this.#authService.isAuthenticated(),
    }),
    loader: async ({ params: { actor, authenticated } }) => {
      if (!authenticated) return [];
      return actor.getMyDistributions();
    },
  });
  readonly #myL1Distributions = computed<DistributionRecord[]>(() =>
    filterMyL1Distributions(
      this.#distributionsResource.value() ?? [],
      this.#authService.principalId(),
    ),
  );

  readonly #recentL1Distributions = computed<DistributionRecord[]>(() => {
    const since = Date.now() - THIRTY_DAYS_MS;
    return this.#myL1Distributions().filter(
      (record) => timeInNanosToDate(record.timestamp).getTime() >= since,
    );
  });

  readonly earnedLast30d = computed<EarningByToken[]>(() =>
    sumEarningsByToken(this.#recentL1Distributions()),
  );

  readonly #balanceService = inject(BalanceService);

  readonly earnedLast30dUsd = computed(() =>
    sumEarningsUsd(this.#recentL1Distributions(), this.#balanceService.rates()),
  );

  readonly earnedUsdByPayer = computed(() =>
    earningsUsdByPayer(this.#myL1Distributions(), this.#balanceService.rates()),
  );

  readonly #pageIndex = signal(0);

  readonly #invitedResource = resource({
    params: () => ({
      actor: this.#actor(),
      authenticated: this.#authService.isAuthenticated(),
      pageIndex: this.#pageIndex(),
    }),
    loader: async ({ params: { actor, authenticated, pageIndex } }) => {
      if (!authenticated) {
        return { data: [] as InvitedUserItem[], total: [] as [] | [bigint] };
      }
      return actor.getMyInvitedUsers({
        offset: BigInt(pageIndex * INVITED_PAGE_SIZE),
        limit: BigInt(INVITED_PAGE_SIZE),
      });
    },
  });

  readonly invitedTotal = computed(
    () => fromNullable(this.#invitedResource.value()?.total ?? []) ?? null,
  );

  readonly invitedUsers = computed<InvitedUserItem[]>(
    () => this.#invitedResource.value()?.data ?? [],
  );

  readonly hasNextPage = computed(() => {
    const total = this.invitedTotal();
    if (total === null) return this.invitedUsers().length === INVITED_PAGE_SIZE;
    return BigInt((this.#pageIndex() + 1) * INVITED_PAGE_SIZE) < total;
  });
  readonly hasPreviousPage = computed(() => this.#pageIndex() > 0);

  readonly invitedCount = computed(
    () => this.invitedTotal() ?? BigInt(this.invitedUsers().length),
  );
  readonly invitedLoading = computed(() => this.#invitedResource.isLoading());
  readonly pageCount = computed(() => {
    const total = this.invitedTotal();
    if (total === null) return null;
    return Math.max(1, Math.ceil(Number(total) / INVITED_PAGE_SIZE));
  });
  readonly pageIndex = this.#pageIndex.asReadonly();
  readonly pageSize = INVITED_PAGE_SIZE;
  /** Set of payer principals (text) that generated a distribution for me. */
  readonly paidPayerIds = computed(() =>
    uniquePayerIds(this.#myL1Distributions()),
  );
  readonly paidReferralsCount = computed(() => this.paidPayerIds().size);

  readonly #discountService = inject(DiscountService);

  readonly referralDiscountBps = this.#discountService.referralDiscountBps;

  readonly #profileService = inject(ProfileService);

  /**
   * The permanent personal referral code. Coupons are shared per-row from the
   * coupons table — a coupon link expires with the coupon, so it must never
   * silently stand in for "your link".
   */
  readonly shareCode = computed<string | null>(
    () =>
      fromNullable(this.#profileService.profile()?.referralCode ?? []) ?? null,
  );

  readonly shareLink = computed<string | null>(() => {
    const code = this.shareCode();
    if (!code) return null;
    return `${window.location.origin}/?ref=${code}`;
  });

  readonly totalEarned = computed<EarningByToken[]>(() =>
    sumEarningsByToken(this.#myL1Distributions()),
  );

  readonly totalEarnedUsd = computed(() =>
    sumEarningsUsd(this.#myL1Distributions(), this.#balanceService.rates()),
  );

  async createCoupon(args: CreateCouponArgs): Promise<boolean> {
    return this.#couponMutation(
      {
        loading: 'Creating coupon...',
        success: 'Coupon created.',
        failPrefix: 'Failed to create coupon',
      },
      () => this.#actor().createCoupon(args),
      (err) =>
        match(err)
          .with({ tooManyActiveCoupons: P.select() }, ({ limit }) =>
            `You already have the maximum of ${limit} active coupons.`,
          )
          .with({ invalidExpiry: P.any }, () => 'The expiry date is invalid.')
          .with(
            { invalidMaxRedemptions: P.any },
            () => 'The redemption limit is invalid.',
          )
          .with({ invalidNote: P.any }, () => 'The note is too long.')
          .with({ userNotFound: P.any }, () => 'Your account was not found.')
          .with(
            { storageError: P.select() },
            (msg) => `Something went wrong: ${msg}`,
          )
          .exhaustive(),
    );
  }

  async deleteCoupon(code: string): Promise<boolean> {
    return this.#couponMutation(
      {
        loading: 'Deleting coupon...',
        success: 'Coupon deleted.',
        failPrefix: 'Failed to delete coupon',
      },
      () => this.#actor().deleteCoupon(code),
      (err) =>
        match(err)
          .with({ couponNotFound: P.any }, () => 'Coupon not found.')
          .with({ notOwner: P.any }, () => 'You do not own this coupon.')
          .with(
            { couponActive: P.any },
            () => 'Revoke the coupon before deleting it.',
          )
          .with(
            { storageError: P.select() },
            (msg) => `Something went wrong: ${msg}`,
          )
          .exhaustive(),
    );
  }

  nextPage(): void {
    if (this.hasNextPage()) this.#pageIndex.update((i) => i + 1);
  }

  previousPage(): void {
    if (this.hasPreviousPage()) this.#pageIndex.update((i) => i - 1);
  }

  reload(): void {
    this.#couponsResource.reload();
    this.#distributionsResource.reload();
    this.#invitedResource.reload();
  }

  async revokeCoupon(code: string): Promise<boolean> {
    return this.#couponMutation(
      {
        loading: 'Revoking coupon...',
        success: 'Coupon revoked.',
        failPrefix: 'Failed to revoke coupon',
      },
      () => this.#actor().revokeCoupon(code),
      (err) =>
        match(err)
          .with({ couponNotFound: P.any }, () => 'Coupon not found.')
          .with({ notOwner: P.any }, () => 'You do not own this coupon.')
          .with(
            { storageError: P.select() },
            (msg) => `Something went wrong: ${msg}`,
          )
          .exhaustive(),
    );
  }

  async #couponMutation<E>(
    messages: { failPrefix: string; loading: string; success: string },
    call: () => Promise<{ err: E } | { ok: unknown }>,
    errToMessage: (err: E) => string,
  ): Promise<boolean> {
    const id = toast.loading(messages.loading);
    try {
      const result = await call();
      if ('ok' in result) {
        toast.success(messages.success, { id });
        this.#couponsResource.reload();
        return true;
      }

      toast.error(errToMessage(result.err), { id });
      return false;
    } catch (error) {
      const message = parseCanisterRejectError(error) ?? 'An error has occurred';
      toast.error(`${messages.failPrefix}: ${message}`, { id });
      return false;
    }
  }
}
