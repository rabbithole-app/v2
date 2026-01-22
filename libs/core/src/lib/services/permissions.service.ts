import { computed, Injectable, resource, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { toast } from 'ngx-sonner';
import { isDeepEqual } from 'remeda';
import { map, mergeMap, mergeWith, Subject } from 'rxjs';

import {
  EncryptedStorage,
  Entry,
  GrantStoragePermission,
  RevokeStoragePermission,
  StoragePermissionItem,
  type TreeNode,
} from '@rabbithole/encrypted-storage';

import { injectEncryptedStorage } from '../injectors';
import { parseCanisterRejectError } from '../utils';

type State = {
  entry: Entry | null;
  loading: Record<'grant' | 'revoke', number[]>;
};

const INITIAL_VALUE: State = {
  entry: null,
  loading: {
    grant: [],
    revoke: [],
  },
};

@Injectable()
export class PermissionsService {
  encryptedStorage = injectEncryptedStorage();
  #state = signal(INITIAL_VALUE);
  #entry = computed(() => this.#state().entry);
  listPermitted = resource<
    StoragePermissionItem[],
    { encryptedStorage: EncryptedStorage; entry: Entry | null }
  >({
    params: () => ({
      encryptedStorage: this.encryptedStorage(),
      entry: this.#entry(),
    }),
    loader: async ({ params: { encryptedStorage, entry } }) => {
      const items = await encryptedStorage.listPermitted(entry ?? undefined);
      return items;
    },
    defaultValue: [],
    equal: isDeepEqual,
  });
  tree = resource<TreeNode[], EncryptedStorage>({
    params: () => this.encryptedStorage(),
    loader: async ({ params: encryptedStorage }) => {
      return await encryptedStorage.fsTree();
    },
    defaultValue: [],
  });
  rootNode = computed(() => this.tree.value()[0]);
  state = this.#state.asReadonly();
  #grantPermission = new Subject<Omit<GrantStoragePermission, 'entry'>>();
  #revokePermission = new Subject<Omit<RevokeStoragePermission, 'entry'>>();

  constructor() {
    const revoke$ = this.#revokePermission.asObservable().pipe(
      map((args) => this.#addEntry(args)),
      mergeMap((args) => this.#revokePermissionHandler(args)),
    );
    const grant$ = this.#grantPermission.asObservable().pipe(
      map((args) => this.#addEntry(args)),
      mergeMap((args) => this.#grantPermissionHandler(args)),
    );
    grant$.pipe(mergeWith(revoke$), takeUntilDestroyed()).subscribe(() => {
      this.listPermitted.reload();
    });
  }

  grantPermission(args: Omit<GrantStoragePermission, 'entry'>) {
    this.#grantPermission.next(args);
  }

  revokePermission(args: Omit<RevokeStoragePermission, 'entry'>) {
    this.#revokePermission.next(args);
  }

  setEntry(entry: Entry | null) {
    this.#state.update((state) => ({ ...state, entry }));
  }

  #addEntry<T = GrantStoragePermission | RevokeStoragePermission>(
    args: Omit<T, 'entry'>,
  ): T {
    const { entry } = this.state();

    return { ...args, entry } as T;
  }

  async #grantPermissionHandler(args: GrantStoragePermission) {
    const id = toast.loading('Grant permission...');
    const encryptedStorage = this.encryptedStorage();
    try {
      await encryptedStorage.grantPermission(args);
      toast.success('Permission succesfully granted', { id });
    } catch (err) {
      const errorMessage =
        parseCanisterRejectError(err) ?? 'An error has occurred';
      toast.error(errorMessage, { id });
    }
  }

  async #revokePermissionHandler(args: RevokeStoragePermission) {
    const id = toast.loading('Revoke permission...');
    const encryptedStorage = this.encryptedStorage();
    try {
      await encryptedStorage.revokePermission(args);
      toast.success('Permission succesfully revoked', { id });
    } catch (err) {
      const errorMessage =
        parseCanisterRejectError(err) ?? 'An error has occurred';
      toast.error(errorMessage, { id });
    }
  }
}
