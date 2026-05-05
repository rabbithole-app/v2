import { computed, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { toast } from 'ngx-sonner';
import { map, mergeMap, mergeWith, Subject } from 'rxjs';

import {
  Entry,
  GrantStoragePermission,
  RevokeStoragePermission,
  StoragePermissionItem,
} from '@rabbithole/encrypted-storage';

import { injectEncryptedStorage } from '../injectors/encrypted-storage';
import { parseCanisterRejectError } from '../utils';

type State = {
  entry: Entry | null;
  permitted: StoragePermissionItem[];
  permittedLoading: boolean;
};

const INITIAL_VALUE: State = {
  entry: null,
  permitted: [],
  permittedLoading: false,
};

@Injectable()
export class PermissionsService {
  encryptedStorage = injectEncryptedStorage();
  #state = signal(INITIAL_VALUE);
  permitted = computed(() => this.#state().permitted);
  permittedLoading = computed(() => this.#state().permittedLoading);
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
      this.loadPermitted();
    });
  }

  grantPermission(args: Omit<GrantStoragePermission, 'entry'>) {
    this.#grantPermission.next(args);
  }

  async loadPermitted() {
    const encryptedStorage = this.encryptedStorage();
    const { entry } = this.#state();
    if (!entry) return;
    this.#state.update((s) => ({ ...s, permittedLoading: true }));
    try {
      const items = await encryptedStorage.listPermitted(entry || undefined);
      this.#state.update((s) => ({ ...s, permitted: items, permittedLoading: false }));
    } catch {
      this.#state.update((s) => ({ ...s, permitted: [], permittedLoading: false }));
    }
  }

  revokePermission(args: Omit<RevokeStoragePermission, 'entry'>) {
    this.#revokePermission.next(args);
  }

  setEntry(entry: Entry | null) {
    this.#state.update((state) => ({ ...state, entry, permitted: [] }));
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
