import { Injectable, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { toast } from 'ngx-sonner';
import { injectDocumentVisibility } from 'ngxtension/inject-document-visibility';
import {
  EMPTY,
  exhaustMap,
  from,
  interval,
  startWith,
  switchMap,
} from 'rxjs';

import type { StoredNotification } from '@rabbithole/declarations';

import { injectMainActor } from '../injectors';
import { parseCanisterRejectError } from '../utils';

const POLLING_INTERVAL_MS = 30_000; // 30 seconds

@Injectable({ providedIn: 'root' })
export class NotificationService {
  notifications = signal<StoredNotification[]>([]);
  unreadCount = signal(0n);

  #actor = injectMainActor();
  #visibility = injectDocumentVisibility();

  constructor() {
    // Poll unread count every 30s, pause when tab is hidden
    toObservable(this.#visibility)
      .pipe(
        switchMap((state) =>
          state === 'visible'
            ? interval(POLLING_INTERVAL_MS).pipe(
                startWith(0),
                exhaustMap(() => from(this.#fetchUnreadCount())),
              )
            : EMPTY
        ),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  async loadNotifications(limit = 20n, since?: bigint): Promise<void> {
    const actor = this.#actor();
    const sinceOpt: [] | [bigint] = since !== undefined ? [since] : [];
    const page = await actor.getNotifications(sinceOpt, limit);
    this.notifications.set(page.data);
    this.unreadCount.set(page.unreadCount);
  }

  async markAllAsRead(): Promise<void> {
    const actor = this.#actor();
    try {
      await actor.markAllNotificationsAsRead();
      this.notifications.update((prev) =>
        prev.map((n) => ({ ...n, read: true })),
      );
      this.unreadCount.set(0n);
    } catch (error) {
      const msg = parseCanisterRejectError(error) ?? 'Failed to mark all as read';
      toast.error(msg);
    }
  }

  async markAsRead(ids: bigint[]): Promise<void> {
    const actor = this.#actor();
    try {
      await actor.markNotificationsAsRead(ids);
      this.notifications.update((prev) =>
        prev.map((n) =>
          ids.includes(n.id) ? { ...n, read: true } : n,
        ),
      );
      this.unreadCount.update((c) => {
        const newCount = c - BigInt(ids.length);
        return newCount < 0n ? 0n : newCount;
      });
    } catch (error) {
      const msg = parseCanisterRejectError(error) ?? 'Failed to mark as read';
      toast.error(msg);
    }
  }

  async #fetchUnreadCount(): Promise<void> {
    try {
      const actor = this.#actor();
      const count = await actor.getUnreadCount();
      this.unreadCount.set(count);
    } catch {
      // Silently fail — polling should not disrupt UX
    }
  }
}
