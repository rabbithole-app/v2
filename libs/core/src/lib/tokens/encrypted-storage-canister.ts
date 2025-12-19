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
    const route = inject(ActivatedRoute);
    const canisterId = route.snapshot.paramMap.get('id');

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

  // Find the 'id' parameter in the parent routes
  let currentRoute: ActivatedRouteSnapshot | null = route;
  let canisterId: string | null = null;

  while (currentRoute && !canisterId) {
    canisterId = currentRoute.paramMap.get('id');
    currentRoute = currentRoute.parent;
  }

  if (!canisterId) {
    throw new Error('Canister ID parameter is required');
  }

  return {
    provide: ENCRYPTED_STORAGE_CANISTER_ID,
    useValue: Principal.fromText(canisterId),
  };
}
