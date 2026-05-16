import { inject, Injector, runInInjectionContext } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  ResolveFn,
  RouterStateSnapshot,
} from '@angular/router';
import { fromNullable } from '@dfinity/utils';

import { AUTH_SERVICE } from '@rabbithole/auth';
import {
  createEncryptedStorageCanisterProviderFromSnapshot,
  injectEncryptedStorage,
  provideEncryptedStorage,
} from '@rabbithole/core/storage-runtime';
import {
  StorageAccessRequest,
  StoragePermission,
} from '@rabbithole/encrypted-storage';

import { NodeItem } from '../types';
import { convertToNodeItem } from '../utils';

export type FileListResolverData = {
  accessRequest: StorageAccessRequest | null;
  directoryPermission: StoragePermission | null;
  items: NodeItem[];
};

export const fileListResolver: ResolveFn<FileListResolverData> = (
  route: ActivatedRouteSnapshot,
  _state: RouterStateSnapshot,
) => {
  const segments = route.url.map((segment) => segment.path);
  const authService = inject(AUTH_SERVICE);
  const injector = inject(Injector);

  return runInInjectionContext(
    Injector.create({
      providers: [
        createEncryptedStorageCanisterProviderFromSnapshot(route),
        provideEncryptedStorage(),
      ],
      parent: injector,
    }),
    async () => {
      const encryptedStorage = injectEncryptedStorage();
      const encryptedStorageInstance = encryptedStorage();
      const path = segments.length > 0 ? segments.join('/') : null;
      const { entries, directoryPermission } = await encryptedStorageInstance
        .list(path ? ['Directory', path] : undefined);

      const permRaw = fromNullable(directoryPermission);
      const accessRequest =
        !permRaw && authService.isAuthenticated()
          ? await encryptedStorageInstance.getMyAccessRequest()
          : null;
      return {
        accessRequest,
        items: entries.map((v) => convertToNodeItem(v, path ?? undefined)),
        directoryPermission: permRaw
          ? (Object.keys(permRaw)[0] as StoragePermission)
          : null,
      };
    },
  );
};
