import { type FactoryProvider, inject, InjectionToken } from '@angular/core';
import { ActivatedRoute, ActivatedRouteSnapshot } from '@angular/router';
import { Principal } from '@icp-sdk/core/principal';

export const ENCRYPTED_STORAGE_CANISTER_ID = new InjectionToken<Principal>(
  'ENCRYPTED_STORAGE_CANISTER_ID',
);

export const ENCRYPTED_STORAGE_URL_TOKEN = new InjectionToken<string>(
  'ENCRYPTED_STORAGE_URL_TOKEN',
);

export type EncryptedStorageCanisterIdSource = Principal | string;

export function encryptedStorageCanisterIdFromRouteSnapshot(
  route: ActivatedRouteSnapshot,
  paramName = 'id',
): Principal {
  const canisterId =
    findCanisterIdInParentChain(route, paramName) ??
    findCanisterIdInRouteTree(route.root, paramName);

  if (!canisterId) {
    throw new Error(`Route parameter "${paramName}" is required`);
  }

  return Principal.fromText(canisterId);
}

export function injectEncryptedStorageCanisterIdFromRouteContext(
  route: ActivatedRouteSnapshot,
  paramName = 'id',
): Principal {
  const canisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID, {
    optional: true,
  });

  return canisterId ?? encryptedStorageCanisterIdFromRouteSnapshot(route, paramName);
}

export function provideEncryptedStorageCanisterId(
  source: EncryptedStorageCanisterIdSource,
): FactoryProvider {
  return {
    provide: ENCRYPTED_STORAGE_CANISTER_ID,
    useFactory: () => resolveCanisterId(source),
  };
}

export function provideEncryptedStorageCanisterIdFromFactory(
  factory: () => EncryptedStorageCanisterIdSource,
): FactoryProvider {
  return {
    provide: ENCRYPTED_STORAGE_CANISTER_ID,
    useFactory: () => resolveCanisterId(factory()),
  };
}

export function provideEncryptedStorageCanisterIdFromRouteParam(
  paramName = 'id',
): FactoryProvider {
  return {
    provide: ENCRYPTED_STORAGE_CANISTER_ID,
    useFactory: () =>
      encryptedStorageCanisterIdFromRouteSnapshot(
        inject(ActivatedRoute).snapshot,
        paramName,
      ),
  };
}

function findCanisterIdInParentChain(
  route: ActivatedRouteSnapshot,
  paramName: string,
): string | null {
  let currentRoute: ActivatedRouteSnapshot | null = route;

  while (currentRoute) {
    const canisterId = currentRoute.paramMap.get(paramName);
    if (canisterId) return canisterId;
    currentRoute = currentRoute.parent;
  }

  return null;
}

function findCanisterIdInRouteTree(
  route: ActivatedRouteSnapshot,
  paramName: string,
): string | null {
  const canisterId = route.paramMap.get(paramName);
  if (canisterId) return canisterId;

  for (const child of route.children) {
    const childCanisterId = findCanisterIdInRouteTree(child, paramName);
    if (childCanisterId) return childCanisterId;
  }

  return null;
}

function resolveCanisterId(
  source: EncryptedStorageCanisterIdSource,
): Principal {
  if (Principal.isPrincipal(source)) return source;

  return Principal.fromText(source);
}
