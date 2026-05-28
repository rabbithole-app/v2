import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  RedirectCommand,
  ResolveFn,
  Router,
} from '@angular/router';
import { Principal } from '@icp-sdk/core/principal';

import { injectMainActor } from '@rabbithole/core';
import {
  AdminUserListItem,
  CreationListItem,
  License,
  SortDirection,
  Subscription,
} from '@rabbithole/declarations/backend';

export interface AdminUserDetailResolverData {
  creations: CreationListItem[];
  creationsTotal: number;
  licenses: License[];
  licensesTotal: number;
  principal: Principal;
  subscription: Subscription | null;
  user: AdminUserListItem;
}

const DESCENDING: SortDirection = { Descending: null };

export const adminUserDetailResolver: ResolveFn<
  AdminUserDetailResolverData | RedirectCommand
> = async (route: ActivatedRouteSnapshot) => {
  const router = inject(Router);
  const actor = injectMainActor()();
  const principalText = route.paramMap.get('principal');

  if (!principalText) {
    return new RedirectCommand(router.parseUrl('/dashboard/admin/users'));
  }

  let principal: Principal;
  try {
    principal = Principal.fromText(principalText);
  } catch {
    return new RedirectCommand(router.parseUrl('/dashboard/admin/users'));
  }

  const [users, subscriptions, licenses, creations] = await Promise.all([
    actor.adminListUsers({
      pagination: { offset: 0n, limit: 1n },
      count: false,
      sort: [],
      filter: {
        id: [[principal]],
        inviter: [],
        role: [],
        verifiedEmail: [],
        identityProvider: [],
        search: [],
        createdAt: [],
        updatedAt: [],
        lastLoginAt: [],
        identitySyncedAt: [],
        referralAppliedAt: [],
      },
    }),
    actor.listSubscriptions({
      pagination: { offset: 0n, limit: 1n },
      count: false,
      sort: [['updatedAt', DESCENDING]],
      filter: {
        userId: [[principal]],
        plan: [],
        status: [],
        expiresAt: [],
      },
    }),
    actor.listLicenses([
      {
        pagination: { offset: 0n, limit: 100n },
        count: true,
        sort: [['receipt.paidAt', DESCENDING]],
        filter: {
          id: [],
          owner: [[principal]],
          canisterId: [],
          paymentId: [],
          statusTag: [],
          hasCanister: [],
          createdAt: [],
          paidAt: [],
        },
      },
    ]),
    actor.listCreations([
      {
        pagination: { offset: 0n, limit: 100n },
        count: true,
        sort: [['createdAt', DESCENDING]],
        filter: {
          id: [],
          owner: [[principal]],
          canisterId: [],
          statusTag: [],
          releaseTag: [],
          hasCanister: [],
          hasLicense: [],
          createdAt: [],
          completedAt: [],
          ambassadorPayoutStatus: [],
        },
      },
    ]),
  ]);

  const user = users.data[0];
  if (!user) {
    return new RedirectCommand(router.parseUrl('/dashboard/admin/users'));
  }

  return {
    creations: creations.data,
    creationsTotal: Number(creations.total[0] ?? creations.data.length),
    licenses: licenses.data,
    licensesTotal: Number(licenses.total[0] ?? licenses.data.length),
    principal,
    subscription: subscriptions.data[0] ?? null,
    user,
  };
};
