import {
  computed,
  inject,
  type Provider,
  resource,
  signal,
  type Signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { fromNullable, uint8ArrayToHexString } from '@dfinity/utils';
import {
  IcManagementCanister,
  type IcManagementDid,
} from '@icp-sdk/canisters/ic-management';
import { Principal } from '@icp-sdk/core/principal';
import { createInjectionToken } from 'ngxtension/create-injection-token';
import { filter, map } from 'rxjs/operators';

import { AUTH_SERVICE } from '@rabbithole/auth';
import { HTTP_AGENT_TOKEN } from '@rabbithole/core/app-runtime';
import { ENCRYPTED_STORAGE_CANISTER_ID } from '@rabbithole/core/storage-canister-token';

const EMPTY_CANISTER_STATUS_PARAMS = {
  canisterId: null,
} as const;

export interface StorageCanisterSettings {
  computeAllocation: bigint;
  controllers: Principal[];
  freezingThreshold: bigint;
  memoryAllocation: bigint;
  moduleHash?: string;
  reservedCyclesLimit: bigint;
  wasmMemoryLimit: bigint;
}

const [
  injectStorageCanisterStatusFromToken,
  provideStorageCanisterStatusValue,
] = createInjectionToken(
  () => createStorageCanisterStatus(injectProvidedStorageCanisterId()),
  {
    isRoot: false,
  },
);

export const injectStorageCanisterStatus = injectStorageCanisterStatusFromToken;

export function provideStorageCanisterStatus(): Provider {
  return provideStorageCanisterStatusValue();
}

export function provideStorageCanisterStatusFromRouteParam(
  paramName = 'id',
): Provider {
  return provideStorageCanisterStatusValue(() =>
    createStorageCanisterStatus(injectRouteStorageCanisterId(paramName)),
  );
}

function createStorageCanisterStatus(canisterId: Signal<Principal | null>) {
  const authService = inject(AUTH_SERVICE);
  const httpAgent = inject(HTTP_AGENT_TOKEN);
  const settingsResource = resource({
    params: () => {
      const principal = authService.identity().getPrincipal();
      const currentCanisterId = canisterId();

      if (principal.isAnonymous() || currentCanisterId === null) {
        return EMPTY_CANISTER_STATUS_PARAMS;
      }

      return {
        agent: httpAgent(),
        canisterId: currentCanisterId,
      };
    },
    loader: async ({ params }): Promise<StorageCanisterSettings | null> => {
      if (params.canisterId === null) {
        return null;
      }

      try {
        const status = await IcManagementCanister.create({
          agent: params.agent,
        }).canisterStatus({ canisterId: params.canisterId });

        return toStorageCanisterSettings(status);
      } catch {
        return null;
      }
    },
  });
  const settings = computed(() =>
    settingsResource.hasValue() ? settingsResource.value() : null,
  );

  return {
    isCurrentUserController: computed(() => settings() !== null),
    isLoading: computed(() => settingsResource.isLoading()),
    reload: () => settingsResource.reload(),
    settings,
  };
}

function findCanisterIdInRouteTree(
  route: ActivatedRouteSnapshot,
  paramName: string,
): Principal | null {
  const canisterId = route.paramMap.get(paramName);
  if (canisterId) return Principal.fromText(canisterId);

  for (const child of route.children) {
    const childCanisterId = findCanisterIdInRouteTree(child, paramName);
    if (childCanisterId) return childCanisterId;
  }

  return null;
}

function injectProvidedStorageCanisterId(): Signal<Principal | null> {
  const providedCanisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID, {
    optional: true,
  });

  if (providedCanisterId) {
    return signal(providedCanisterId);
  }

  return signal(null);
}

function injectRouteStorageCanisterId(
  paramName: string,
): Signal<Principal | null> {
  const router = inject(Router);

  return toSignal(
    router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() =>
        findCanisterIdInRouteTree(router.routerState.snapshot.root, paramName),
      ),
    ),
    {
      initialValue: findCanisterIdInRouteTree(
        router.routerState.snapshot.root,
        paramName,
      ),
    },
  );
}

function toStorageCanisterSettings(
  status: IcManagementDid.canister_status_result,
): StorageCanisterSettings {
  const moduleHash = fromNullable(status.module_hash);
  const { settings } = status;

  return {
    computeAllocation: settings.compute_allocation,
    controllers: settings.controllers,
    freezingThreshold: settings.freezing_threshold,
    memoryAllocation: settings.memory_allocation,
    ...(moduleHash ? { moduleHash: uint8ArrayToHexString(moduleHash) } : {}),
    reservedCyclesLimit: settings.reserved_cycles_limit,
    wasmMemoryLimit: settings.wasm_memory_limit,
  };
}
