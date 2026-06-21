import { computed, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { toast } from '@spartan-ng/brain/sonner';
import { map, mergeMap, mergeWith, Subject } from 'rxjs';

import {
  CreateStorageAccessGrant,
  CreateStorageAccessGrants,
  RevokeStorageAccessGrant,
  RevokeStorageAccessGrants,
  StorageAccessScope,
  StoragePermissionItem,
} from '@rabbithole/encrypted-storage';

import { injectEncryptedStorage } from '../injectors/encrypted-storage';
import { parseCanisterRejectError } from '../utils';

type State = {
  entry: StorageAccessScope | undefined;
  permitted: StoragePermissionItem[];
  permittedLoading: boolean;
};

const INITIAL_VALUE: State = {
  entry: undefined,
  permitted: [],
  permittedLoading: false,
};

@Injectable()
export class PermissionsService {
  encryptedStorage = injectEncryptedStorage();
  #accessChanges = new Subject<void>();
  accessChanges$ = this.#accessChanges.asObservable();
  #state = signal(INITIAL_VALUE);
  permitted = computed(() => this.#state().permitted);
  permittedLoading = computed(() => this.#state().permittedLoading);
  state = this.#state.asReadonly();
  #cancelPendingAccessGrant = new Subject<bigint>();
  #createAccessGrants = new Subject<CreateStorageAccessGrants>();
  #revokeAccessGrants = new Subject<RevokeStorageAccessGrants>();

  constructor() {
    const cancelPending$ = this.#cancelPendingAccessGrant
      .asObservable()
      .pipe(
        mergeMap((grantId) => this.#cancelPendingAccessGrantHandler(grantId)),
      );
    const revoke$ = this.#revokeAccessGrants.asObservable().pipe(
      map((args) => this.#addEntryToItems(args)),
      mergeMap((args) => this.#revokeAccessGrantsHandler(args)),
    );
    const grant$ = this.#createAccessGrants.asObservable().pipe(
      map((args) => this.#addEntryToItems(args)),
      mergeMap((args) => this.#createAccessGrantsHandler(args)),
    );
    grant$
      .pipe(mergeWith(revoke$, cancelPending$), takeUntilDestroyed())
      .subscribe((success) => {
        if (success) {
          this.loadPermitted();
          this.#accessChanges.next();
        }
      });
  }

  cancelPendingAccessGrant(grantId: bigint) {
    this.#cancelPendingAccessGrant.next(grantId);
  }

  createAccessGrants(args: CreateStorageAccessGrants) {
    this.#createAccessGrants.next(args);
  }

  async loadPermitted() {
    const encryptedStorage = this.encryptedStorage();
    const { entry } = this.#state();
    if (entry === undefined) {
      return;
    }
    this.#state.update((s) => ({ ...s, permittedLoading: true }));
    try {
      const items = await encryptedStorage.listAccessGrants(entry);
      this.#state.update((s) => ({
        ...s,
        permitted: items,
        permittedLoading: false,
      }));
    } catch (err) {
      const errorMessage =
        parseCanisterRejectError(err) ?? 'Access list failed to load';
      toast.error(errorMessage);
      this.#state.update((s) => ({
        ...s,
        permitted: [],
        permittedLoading: false,
      }));
    }
  }

  revokeAccessGrants(args: RevokeStorageAccessGrants) {
    this.#revokeAccessGrants.next(args);
  }

  setEntry(entry: StorageAccessScope | undefined) {
    this.#state.update((state) => ({ ...state, entry, permitted: [] }));
  }

  #addEntryToItems<
    T extends CreateStorageAccessGrant | RevokeStorageAccessGrant,
  >(args: { items: T[] }): { items: T[] } {
    const { entry } = this.state();

    return {
      items: args.items.map((item) => {
        const scopedItem = { ...item };
        if (scopedItem.entry === undefined && entry !== undefined) {
          scopedItem.entry = entry;
        }
        return scopedItem;
      }),
    };
  }

  async #cancelPendingAccessGrantHandler(grantId: bigint) {
    const id = toast.loading('Updating access...');
    const encryptedStorage = this.encryptedStorage();
    try {
      await encryptedStorage.cancelPendingAccessGrant(grantId);
      toast.success('Access updated', { id });
      return true;
    } catch (err) {
      const errorMessage =
        parseCanisterRejectError(err) ?? 'An error has occurred';
      toast.error(errorMessage, { id });
      return false;
    }
  }

  async #createAccessGrantsHandler(args: CreateStorageAccessGrants) {
    const id = toast.loading('Create access grants...');
    const encryptedStorage = this.encryptedStorage();
    try {
      await encryptedStorage.createAccessGrants(args);
      toast.success('Access grants created', { id });
      return true;
    } catch (err) {
      const errorMessage =
        parseCanisterRejectError(err) ?? 'An error has occurred';
      toast.error(errorMessage, { id });
      return false;
    }
  }

  async #revokeAccessGrantsHandler(args: RevokeStorageAccessGrants) {
    const id = toast.loading('Revoke access grants...');
    const encryptedStorage = this.encryptedStorage();
    try {
      await encryptedStorage.revokeAccessGrants(args);
      toast.success('Access grants revoked', { id });
      return true;
    } catch (err) {
      const errorMessage =
        parseCanisterRejectError(err) ?? 'An error has occurred';
      toast.error(errorMessage, { id });
      return false;
    }
  }
}
