import { inject, InjectionToken, Provider } from '@angular/core';
import { ActivatedRoute, ActivatedRouteSnapshot } from '@angular/router';
import { Principal } from '@icp-sdk/core/principal';

export const ENCRYPTED_STORAGE_CANISTER_ID = new InjectionToken<Principal>(
  'ENCRYPTED_STORAGE_CANISTER_ID',
);

export const ENCRYPTED_STORAGE_URL_TOKEN = new InjectionToken<string>(
  'ENCRYPTED_STORAGE_URL_TOKEN',
);

export const ENCRYPTED_STORAGE_FROM_ACTIVATED_ROUTE_PROVIDER = {
  provide: ENCRYPTED_STORAGE_CANISTER_ID,
  useFactory: () => {
    const providedCanisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID, {
      optional: true,
      skipSelf: true,
    });

    if (providedCanisterId) {
      return providedCanisterId;
    }

    const route = inject(ActivatedRoute);
    const canisterId =
      findCanisterIdInParentChain(route.snapshot) ??
      findCanisterIdInRouteTree(route.snapshot.root);

    if (!canisterId) {
      throw new Error('Canister ID parameter is required');
    }

    return Principal.fromText(canisterId);
  },
};

/**
 * Creates a provider for ENCRYPTED_STORAGE_CANISTER_ID from ActivatedRouteSnapshot.
 * Used in resolvers where ActivatedRoute is not available.
 */
export function createEncryptedStorageCanisterProviderFromSnapshot(
  route: ActivatedRouteSnapshot,
): Provider {
  const providedCanisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID, {
    optional: true,
  });

  if (providedCanisterId) {
    return {
      provide: ENCRYPTED_STORAGE_CANISTER_ID,
      useValue: providedCanisterId,
    };
  }

  const canisterId =
    findCanisterIdInParentChain(route) ?? findCanisterIdInRouteTree(route.root);

  if (!canisterId) {
    throw new Error('Canister ID parameter is required');
  }

  return {
    provide: ENCRYPTED_STORAGE_CANISTER_ID,
    useValue: Principal.fromText(canisterId),
  };
}

function findCanisterIdInParentChain(
  route: ActivatedRouteSnapshot,
): string | null {
  let currentRoute: ActivatedRouteSnapshot | null = route;

  while (currentRoute) {
    const canisterId = currentRoute.paramMap.get('id');
    if (canisterId) return canisterId;
    currentRoute = currentRoute.parent;
  }

  return null;
}

function findCanisterIdInRouteTree(
  route: ActivatedRouteSnapshot,
): string | null {
  const canisterId = route.paramMap.get('id');
  if (canisterId) return canisterId;

  for (const child of route.children) {
    const childCanisterId = findCanisterIdInRouteTree(child);
    if (childCanisterId) return childCanisterId;
  }

  return null;
}
