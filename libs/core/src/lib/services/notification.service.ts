import { computed, inject, Injectable, signal } from '@angular/core';
import {
  takeUntilDestroyed,
  toObservable,
  toSignal,
} from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { Actor } from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';
import { toast } from '@spartan-ng/brain/sonner';
import { SignalMap } from 'ngxtension/collections';
import { injectDocumentVisibility } from 'ngxtension/inject-document-visibility';
import { poll } from 'ngxtension/poll';
import {
  catchError,
  combineLatest,
  defer,
  distinctUntilChanged,
  EMPTY,
  exhaustMap,
  filter,
  finalize,
  firstValueFrom,
  forkJoin,
  from,
  map,
  merge,
  Observable,
  of,
  skip,
  startWith,
  switchMap,
  tap,
} from 'rxjs';

import type {
  NotificationsPage,
  StoredNotification,
} from '@rabbithole/declarations/backend';
import {
  type EncryptedStorageActorService,
  encryptedStorageIdlFactory,
  type StoredStorageEvent,
} from '@rabbithole/declarations/encrypted-storage';

import { injectHttpAgent, injectMainActor } from '../injectors';
import { ENCRYPTED_STORAGE_CANISTER_ID } from '../tokens';
import { parseCanisterRejectError } from '../utils';

export type AggregatedNotification =
  | {
      createdAt: bigint;
      id: string;
      raw: StoredNotification;
      rawId: bigint;
      read: boolean;
      source: 'backend';
    }
  | {
      createdAt: bigint;
      id: string;
      raw: StoredStorageEvent;
      rawId: bigint;
      read: boolean;
      source: 'storage';
      storageCanisterId: Principal;
    };

const EMPTY_BACKEND_STATE: BackendNotificationState = {
  items: [],
  unreadCount: 0n,
};
const POLLING_INTERVAL_MS = 30_000;

type BackendLoadResult =
  | { error: unknown; ok: false }
  | { ok: true; page: NotificationsPage };

type BackendNotificationState = {
  items: StoredNotification[];
  unreadCount: bigint;
};

type CurrentStorageSnapshot = {
  canisterId: Principal | null;
  state: StorageNotificationState | null;
};

type StorageEventsPage = {
  canisterId: Principal | null;
  events: StoredStorageEvent[];
  unreadCount: bigint;
};

type StorageNotificationState = {
  events: StoredStorageEvent[];
  readCursor: bigint | null;
  unreadCount: bigint;
};

function aggregateNotifications(
  backendNotifications: StoredNotification[],
  storageSnapshot: CurrentStorageSnapshot,
): AggregatedNotification[] {
  const backendItems = backendNotifications.map(toBackendItem);
  const storageItems = toStorageItems(storageSnapshot);
  const storageCorrelationIds = new Set(
    storageItems
      .map((item) => correlationId(item.raw.correlationId))
      .filter((id): id is string => id !== null),
  );
  const deduplicatedBackendItems = backendItems.filter((item) => {
    const id = correlationId(item.raw.correlationId);
    return id === null || !storageCorrelationIds.has(id);
  });

  return [...deduplicatedBackendItems, ...storageItems].sort(
    compareNotificationTimeDesc,
  );
}

function compareNotificationTimeDesc(
  a: AggregatedNotification,
  b: AggregatedNotification,
): number {
  if (a.createdAt === b.createdAt) return 0;
  return a.createdAt > b.createdAt ? -1 : 1;
}

function correlationId(value: [] | [string]): string | null {
  return value[0] ?? null;
}

function decrement(value: bigint, by: bigint): bigint {
  const next = value - by;
  return next < 0n ? 0n : next;
}

function inferStorageReadCursor(
  events: StoredStorageEvent[],
  unreadCount: bigint,
): bigint | null {
  if (events.length === 0) return null;
  if (unreadCount === 0n) {
    return maxStorageEventId(events);
  }

  const unreadItems = Number(unreadCount);
  return unreadItems < events.length ? events[unreadItems].id : null;
}

function maxStorageEventId(events: StoredStorageEvent[]): bigint | null {
  if (events.length === 0) return null;
  return events.reduce(
    (max, event) => (event.id > max ? event.id : max),
    events[0].id,
  );
}

function parseStorageCanisterIdFromUrl(url: string): Principal | null {
  const path = url.split('?')[0] ?? '';
  const match = /^\/dashboard\/([^/()?#]+)/.exec(path);
  if (!match) return null;

  try {
    return Principal.fromText(match[1]);
  } catch {
    return null;
  }
}

function storageEventRead(
  state: StorageNotificationState,
  event: StoredStorageEvent,
): boolean {
  return state.readCursor !== null && event.id <= state.readCursor;
}

function storageOverlayUnreadCount(
  state: StorageNotificationState | null,
  backendNotifications: StoredNotification[],
): bigint {
  if (!state) return 0n;
  if (state.events.length === 0) return state.unreadCount;

  const backendCorrelationIds = new Set(
    backendNotifications
      .map((item) => correlationId(item.correlationId))
      .filter((id): id is string => id !== null),
  );

  return state.events.reduce((count, event) => {
    const id = correlationId(event.correlationId);
    if (id !== null && backendCorrelationIds.has(id)) return count;
    return storageEventRead(state, event) ? count : count + 1n;
  }, 0n);
}

function storageStateFromPage(page: StorageEventsPage): StorageNotificationState {
  return {
    events: page.events,
    readCursor: inferStorageReadCursor(page.events, page.unreadCount),
    unreadCount: page.unreadCount,
  };
}

function toBackendItem(
  notification: StoredNotification,
): AggregatedNotification {
  return {
    createdAt: notification.createdAt,
    id: `backend:${notification.id.toString()}`,
    raw: notification,
    rawId: notification.id,
    read: notification.read,
    source: 'backend',
  };
}

function toStorageItems(
  snapshot: CurrentStorageSnapshot,
): AggregatedNotification[] {
  const { canisterId, state } = snapshot;
  if (!canisterId || !state) return [];

  return state.events.map((event) => ({
    createdAt: event.timestamp,
    id: `storage:${canisterId.toText()}:${event.id.toString()}`,
    raw: event,
    rawId: event.id,
    read: storageEventRead(state, event),
    source: 'storage',
    storageCanisterId: canisterId,
  }));
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly isLoading = signal(false);

  readonly #backendState = signal<BackendNotificationState>(
    EMPTY_BACKEND_STATE,
  );
  readonly notifications = computed(() => this.#backendState().items);
  readonly #rootStorageCanisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID, {
    optional: true,
  });
  readonly #router = inject(Router, { optional: true });
  readonly #routeUrl = toSignal(
    this.#router
      ? this.#router.events.pipe(
          filter(
            (event): event is NavigationEnd => event instanceof NavigationEnd,
          ),
          map((event) => event.urlAfterRedirects),
          startWith(this.#router.url),
        )
      : of(''),
    { initialValue: this.#router?.url ?? '' },
  );
  readonly #currentStorageCanisterId = computed(() => {
    if (this.#rootStorageCanisterId) return this.#rootStorageCanisterId;
    return parseStorageCanisterIdFromUrl(this.#routeUrl());
  });
  readonly #storageStates = new SignalMap<string, StorageNotificationState>();

  readonly #currentStorageSnapshot = computed<CurrentStorageSnapshot>(() => {
    const canisterId = this.#currentStorageCanisterId();
    if (!canisterId) return { canisterId: null, state: null };

    return {
      canisterId,
      state: this.#storageStates.get(canisterId.toText()) ?? null,
    };
  });
  readonly items = toSignal(
    combineLatest([
      toObservable(this.notifications),
      toObservable(this.#currentStorageSnapshot),
    ]).pipe(
      map(([backendNotifications, storageSnapshot]) =>
        aggregateNotifications(backendNotifications, storageSnapshot),
      ),
    ),
    { initialValue: [] },
  );

  readonly unreadCount = toSignal(
    combineLatest([
      toObservable(this.#backendState),
      toObservable(this.#currentStorageSnapshot),
    ]).pipe(
      map(
        ([backend, storage]) =>
          backend.unreadCount +
          storageOverlayUnreadCount(storage.state, backend.items),
      ),
    ),
    { initialValue: 0n },
  );

  readonly #actor = injectMainActor();
  readonly #httpAgent = injectHttpAgent();
  readonly #visibility = injectDocumentVisibility();

  constructor() {
    const storageContextChanged$ = toObservable(
      this.#currentStorageCanisterId,
    ).pipe(
      map((canisterId) => canisterId?.toText() ?? null),
      distinctUntilChanged(),
      skip(1),
    );

    merge(
      this.#visiblePollingRefresh$(),
      storageContextChanged$.pipe(exhaustMap(() => this.#fetchUnreadCount$())),
    )
      .pipe(
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  async loadNotifications(limit = 20n, afterId?: bigint): Promise<void> {
    await firstValueFrom(
      defer(() => {
        this.isLoading.set(true);

        return forkJoin({
          backend: this.#loadBackendNotifications$(limit, afterId),
          storage: this.#loadCurrentStorageEvents$(limit),
        }).pipe(
          tap(({ backend, storage }) => {
            this.#applyBackendLoadResult(backend);
            this.#applyStorageEventsPage(storage);
          }),
          catchError((error) => {
            const message =
              parseCanisterRejectError(error) ?? 'Failed to load notifications';
            toast.error(message);
            return of(undefined);
          }),
          finalize(() => this.isLoading.set(false)),
          map(() => undefined),
        );
      }),
    );
  }

  async markAllAsRead(): Promise<void> {
    const storageActor = this.#storageActor();

    await firstValueFrom(
      forkJoin([
        from(this.#actor().markAllNotificationsRead()),
        storageActor
          ? from(storageActor.markAllVisibleStorageEventsRead())
          : of(undefined),
      ]).pipe(
        tap(() => {
          this.#markBackendNotificationsRead();
          this.#markCurrentStorageStateRead();
        }),
        catchError((error) => {
          const message =
            parseCanisterRejectError(error) ?? 'Failed to mark all as read';
          toast.error(message);
          return of(undefined);
        }),
        map(() => undefined),
      ),
    );
  }

  async markAsRead(ids: bigint[]): Promise<void> {
    await firstValueFrom(
      this.#markBackendNotificationsRead$(ids).pipe(
        catchError((error) => {
          const message =
            parseCanisterRejectError(error) ?? 'Failed to mark as read';
          toast.error(message);
          return of(undefined);
        }),
      ),
    );
  }

  async markItemAsRead(item: AggregatedNotification): Promise<void> {
    if (item.read) return;

    if (item.source === 'backend') {
      await this.markAsRead([item.rawId]);
      return;
    }

    const actor = this.#storageActor(item.storageCanisterId);
    if (!actor) return;

    const matchingBackendNotificationId =
      this.#backendNotificationIdByCorrelation(
        correlationId(item.raw.correlationId),
      );

    await firstValueFrom(
      from(actor.markStorageEventsRead(item.rawId)).pipe(
        tap(() => this.#markStorageEventRead(item)),
        switchMap(() =>
          matchingBackendNotificationId === null
            ? of(undefined)
            : this.#markBackendNotificationsRead$([
                matchingBackendNotificationId,
              ]).pipe(
                catchError((error) => {
                  const message =
                    parseCanisterRejectError(error) ?? 'Failed to mark as read';
                  toast.error(message);
                  return of(undefined);
                }),
              ),
        ),
        catchError((error) => {
          const message =
            parseCanisterRejectError(error) ?? 'Failed to mark as read';
          toast.error(message);
          return of(undefined);
        }),
        map(() => undefined),
      ),
    );
  }

  #applyBackendLoadResult(result: BackendLoadResult): void {
    if (result.ok) {
      this.#backendState.set({
        items: result.page.data,
        unreadCount: result.page.unreadCount,
      });
      return;
    }

    const message =
      parseCanisterRejectError(result.error) ??
      'Failed to load backend notifications';
    toast.error(message);
  }

  #applyStorageEventsPage(page: StorageEventsPage): void {
    if (!page.canisterId) return;
    this.#setStorageState(page.canisterId, storageStateFromPage(page));
  }

  #backendNotificationIdByCorrelation(
    targetCorrelationId: string | null,
  ): bigint | null {
    if (targetCorrelationId === null) return null;

    const notification = this.notifications().find(
      (item) => correlationId(item.correlationId) === targetCorrelationId,
    );
    return notification?.read === false ? notification.id : null;
  }

  #fetchUnreadCount$(): Observable<void> {
    const canisterId = this.#currentStorageCanisterId();
    const storageActor = this.#storageActor(canisterId);

    return forkJoin({
      backend: from(this.#actor().getUnreadNotificationCount()).pipe(
        catchError(() => of(null)),
      ),
      storage: storageActor
        ? from(storageActor.getStorageEventsUnreadCount()).pipe(
            catchError(() => of(null)),
          )
        : of(null),
    }).pipe(
      tap(({ backend, storage }) => {
        if (backend !== null) {
          this.#backendState.update((state) => ({
            ...state,
            unreadCount: backend,
          }));
        }

        if (
          storage !== null &&
          canisterId &&
          this.#storageStates.has(canisterId.toText())
        ) {
          this.#updateStorageState(canisterId, (state) => ({
            ...state,
            unreadCount: storage,
          }));
        }
      }),
      map(() => undefined),
    );
  }

  #loadBackendNotifications$(
    limit: bigint,
    afterId?: bigint,
  ): Observable<BackendLoadResult> {
    return from(
      this.#actor().listNotifications({
        afterId: afterId === undefined ? [] : [afterId],
        limit,
        unreadOnly: false,
      }),
    ).pipe(
      map((page): BackendLoadResult => ({ ok: true, page })),
      catchError(
        (error: unknown): Observable<BackendLoadResult> =>
          of({ error, ok: false }),
      ),
    );
  }

  #loadCurrentStorageEvents$(limit: bigint): Observable<StorageEventsPage> {
    const canisterId = this.#currentStorageCanisterId();
    const actor = this.#storageActor(canisterId);

    if (!actor) {
      return of({ canisterId: null, events: [], unreadCount: 0n });
    }

    return forkJoin({
      events: from(actor.listLatestStorageEvents(limit)),
      unreadCount: from(actor.getStorageEventsUnreadCount()),
    }).pipe(
      map(({ events, unreadCount }) => ({
        canisterId,
        events,
        unreadCount,
      })),
      catchError(() => of({ canisterId, events: [], unreadCount: 0n })),
    );
  }

  #markBackendNotificationsRead(): void {
    this.#backendState.update((state) => ({
      items: state.items.map((item) => ({ ...item, read: true })),
      unreadCount: 0n,
    }));
  }

  #markBackendNotificationsRead$(ids: bigint[]): Observable<void> {
    if (ids.length === 0) return of(undefined);

    return from(this.#actor().markNotificationsRead(ids)).pipe(
      tap(() => this.#markBackendNotificationsReadById(ids)),
      map(() => undefined),
    );
  }

  #markBackendNotificationsReadById(ids: bigint[]): void {
    const idSet = new Set(ids);

    this.#backendState.update((state) => {
      let markedUnreadCount = 0n;
      const items = state.items.map((item) => {
        if (!idSet.has(item.id)) return item;
        if (!item.read) markedUnreadCount += 1n;
        return { ...item, read: true };
      });

      return {
        items,
        unreadCount: decrement(state.unreadCount, markedUnreadCount),
      };
    });
  }

  #markCurrentStorageStateRead(): void {
    const canisterId = this.#currentStorageCanisterId();
    if (!canisterId) return;

    this.#updateStorageState(canisterId, (state) => ({
      ...state,
      readCursor: maxStorageEventId(state.events) ?? state.readCursor,
      unreadCount: 0n,
    }));
  }

  #markStorageEventRead(
    item: Extract<AggregatedNotification, { source: 'storage' }>,
  ): void {
    this.#updateStorageState(item.storageCanisterId, (state) => ({
      ...state,
      readCursor:
        state.readCursor === null || item.rawId > state.readCursor
          ? item.rawId
          : state.readCursor,
      unreadCount: decrement(state.unreadCount, 1n),
    }));
  }

  #setStorageState(
    canisterId: Principal,
    state: StorageNotificationState,
  ): void {
    this.#storageStates.set(canisterId.toText(), state);
  }

  #storageActor(
    canisterId = this.#currentStorageCanisterId(),
  ): EncryptedStorageActorService | null {
    if (!canisterId) return null;

    return Actor.createActor<EncryptedStorageActorService>(
      encryptedStorageIdlFactory,
      {
        agent: this.#httpAgent(),
        canisterId,
      },
    );
  }

  #updateStorageState(
    canisterId: Principal,
    updater: (state: StorageNotificationState) => StorageNotificationState,
  ): void {
    const key = canisterId.toText();
    const currentState = this.#storageStates.get(key);
    if (!currentState) return;

    this.#storageStates.set(key, updater(currentState));
  }

  #visiblePollingRefresh$(): Observable<void> {
    return toObservable(this.#visibility).pipe(
      switchMap((state) =>
        state === 'visible'
          ? defer(() => this.#fetchUnreadCount$()).pipe(
              poll(POLLING_INTERVAL_MS),
            )
          : EMPTY,
      ),
    );
  }
}
