import {
  computed,
  inject,
  Injectable,
  Injector,
  resource,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { toast } from 'ngx-sonner';
import { isDeepEqual } from 'remeda';
import { map, mergeMap, mergeWith, Subject } from 'rxjs';

import { PermissionsItem } from './permissions.model';
import { convertPermissionInfoItems } from './permissions.utils';
import { Entry, GrantPermission, RevokePermission } from '@rabbithole/assets';
import {
  injectStorageActor,
  parseCanisterRejectError,
  StorageCanisterActor,
} from '@rabbithole/core';

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

@Injectable({ providedIn: 'root' })
export class PermissionsService {
  #injector = inject(Injector);
  storageActor = injectStorageActor({
    injector: this.#injector,
  });
  #state = signal(INITIAL_VALUE);
  #entry = computed(() => this.#state().entry);
  listPermitted = resource<
    PermissionsItem[],
    { actor: StorageCanisterActor; entry: Entry | null }
  >({
    params: () => ({ actor: this.storageActor(), entry: this.#entry() }),
    loader: async ({ params: { actor, entry } }) => {
      const items = await actor.list_permitted({
        entry: entry ? [entry] : [],
        permission: [],
      });
      return convertPermissionInfoItems(items);
    },
    defaultValue: [],
    equal: isDeepEqual,
  });
  state = this.#state.asReadonly();
  #grantPermission = new Subject<Omit<GrantPermission, 'entry'>>();
  #revokePermission = new Subject<Omit<RevokePermission, 'entry'>>();

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

  grantPermission(args: Omit<GrantPermission, 'entry'>) {
    this.#grantPermission.next(args);
  }

  revokePermission(args: Omit<RevokePermission, 'entry'>) {
    this.#revokePermission.next(args);
  }

  setEntry(entry: Entry | null) {
    this.#state.update((state) => ({ ...state, entry }));
  }

  #addEntry<T = GrantPermission | RevokePermission>(args: Omit<T, 'entry'>): T {
    const { entry } = this.state();
    return {
      ...args,
      entry: entry ? [entry] : [],
    } as T;
  }

  async #grantPermissionHandler(args: GrantPermission) {
    const id = toast.loading('Grant permission...');
    const actor = this.storageActor();
    try {
      await actor.grant_permission(args);
      toast.success('Permission succesfully granted', { id });
    } catch (err) {
      const errorMessage =
        parseCanisterRejectError(err) ?? 'An error has occurred';
      toast.error(errorMessage, { id });
    }
  }

  async #revokePermissionHandler(args: RevokePermission) {
    const id = toast.loading('Revoke permission...');
    const actor = this.storageActor();
    try {
      await actor.revoke_permission(args);
      toast.success('Permission succesfully revoked', { id });
    } catch (err) {
      const errorMessage =
        parseCanisterRejectError(err) ?? 'An error has occurred';
      toast.error(errorMessage, { id });
    }
  }
}
