import { inject, Injector, runInInjectionContext } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  ResolveFn,
  RouterStateSnapshot,
} from '@angular/router';

import {
  createEncryptedStorageCanisterProviderFromSnapshot,
  injectEncryptedStorage,
  provideEncryptedStorage,
} from '@rabbithole/core';

import { NodeItem } from '../types';
import { convertToNodeItem } from '../utils';

export const fileListResolver: ResolveFn<NodeItem[]> = (
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
      const nodes = await encryptedStorageInstance
        .list(path ? ['Directory', path] : undefined);

      return nodes.map((v) => convertToNodeItem(v, path ?? undefined));
    },
  );
};
