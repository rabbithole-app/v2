import { inject, Injector, runInInjectionContext } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  ResolveFn,
  RouterStateSnapshot,
} from '@angular/router';
import { fromNullable } from '@dfinity/utils';

import {
  createEncryptedStorageCanisterProviderFromSnapshot,
  injectEncryptedStorage,
  provideEncryptedStorage,
} from '@rabbithole/core';
import { StoragePermission } from '@rabbithole/encrypted-storage';

import { NodeItem } from '../types';
import { convertToNodeItem } from '../utils';

export type FileListResolverData = {
  items: NodeItem[];
  directoryPermission: StoragePermission | null;
};

export const fileListResolver: ResolveFn<FileListResolverData> = (
  route: ActivatedRouteSnapshot,
  _state: RouterStateSnapshot,
) => {
  const segments = route.url.map((segment) => segment.path);
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
      return {
        items: entries.map((v) => convertToNodeItem(v, path ?? undefined)),
        directoryPermission: permRaw
          ? (Object.keys(permRaw)[0] as StoragePermission)
          : null,
      };
    },
  );
};
