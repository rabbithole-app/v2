import { inject, Injector, runInInjectionContext } from '@angular/core';
import { ResolveFn } from '@angular/router';

import {
  injectEncryptedStorage,
  injectEncryptedStorageCanisterIdFromRouteContext,
  provideEncryptedStorage,
  provideEncryptedStorageCanisterId,
} from '@rabbithole/core/storage-runtime';
import type {
  StorageAccessRequest,
  TreeNode,
} from '@rabbithole/encrypted-storage';

export const accessRequestsResolver: ResolveFn<StorageAccessRequest[]> = async (
  route,
) => {
  const injector = inject(Injector);
  const canisterId = injectEncryptedStorageCanisterIdFromRouteContext(route);

  return runInInjectionContext(
    Injector.create({
      providers: [
        provideEncryptedStorageCanisterId(canisterId),
        provideEncryptedStorage(),
      ],
      parent: injector,
    }),
    async () => {
      const encryptedStorage = injectEncryptedStorage();
      return encryptedStorage().listAccessRequests();
    },
  );
};

export const accessRequestTreeResolver: ResolveFn<TreeNode[]> = async (route) => {
  const requestId = parseRequestId(route.paramMap.get('requestId'));
  if (requestId === null) return [];

  const requests = route.parent?.data['accessRequests'] as
    | StorageAccessRequest[]
    | undefined;
  const request = requests?.find((candidate) => candidate.id === requestId);
  if (!request || !('pending' in request.status)) return [];

  const injector = inject(Injector);
  const canisterId = injectEncryptedStorageCanisterIdFromRouteContext(route);
  return runInInjectionContext(
    Injector.create({
      providers: [
        provideEncryptedStorageCanisterId(canisterId),
        provideEncryptedStorage(),
      ],
      parent: injector,
    }),
    async () => {
      const encryptedStorage = injectEncryptedStorage();
      return encryptedStorage().fsTree();
    },
  );
};

function parseRequestId(value: string | null): bigint | null {
  if (!value) return null;

  try {
    return BigInt(value);
  } catch {
    return null;
  }
}
