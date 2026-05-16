import { DatePipe } from '@angular/common';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Principal } from '@icp-sdk/core/principal';
import { formatDistanceToNowStrict } from 'date-fns';
import { toast } from 'ngx-sonner';

import {
  injectMainActor,
  parseCanisterRejectError,
  timeInNanosToDate,
} from '@rabbithole/core';
import { injectEncryptedStorage } from '@rabbithole/core/storage-runtime';
import {
  ResolveStorageAccessRequest,
  StorageAccessRequest,
  StorageAccessRequestStatus,
  TreeNode,
} from '@rabbithole/encrypted-storage';

type AccessProfile = {
  avatarSrc?: string;
  title: string;
  username?: string;
};

@Injectable()
export class AccessRequestsStore {
  readonly requests = signal<StorageAccessRequest[]>([]);
  readonly approvedCount = computed(() =>
    this.requests().filter((request) => 'approved' in request.status).length,
  );
  readonly busyIds = signal<Set<bigint>>(new Set());

  readonly closedCount = computed(() =>
    this.requests().filter(
      (request) =>
        'rejected' in request.status || 'cancelled' in request.status,
    ).length,
  );
  readonly errorMessage = signal<string | null>(null);
  readonly loading = signal(false);
  readonly pendingCount = computed(() =>
    this.requests().filter((request) => this.isPending(request)).length,
  );
  readonly profiles = signal(new Map<string, AccessProfile>());
  readonly sortedRequests = computed(() =>
    [...this.requests()].sort((left, right) => {
      if (left.createdAt === right.createdAt) return 0;
      return left.createdAt < right.createdAt ? 1 : -1;
    }),
  );
  readonly tree = signal<TreeNode[]>([]);

  readonly treeLoading = signal(false);

  readonly #datePipe = inject(DatePipe);

  readonly #encryptedStorage = injectEncryptedStorage();

  readonly #mainActor = injectMainActor();

  formatRelativeTime(value: bigint): string {
    return formatDistanceToNowStrict(timeInNanosToDate(value), {
      addSuffix: true,
    });
  }

  formatTime(value: bigint): string {
    return this.#datePipe.transform(timeInNanosToDate(value), 'medium') ?? '';
  }

  isBusy(requestId: bigint): boolean {
    return this.busyIds().has(requestId);
  }

  isPending(request: StorageAccessRequest): boolean {
    return 'pending' in request.status;
  }

  async loadRequests(): Promise<void> {
    if (this.loading()) return;

    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      this.setRequests(await this.#encryptedStorage().listAccessRequests());
    } catch (error) {
      this.requests.set([]);
      this.errorMessage.set(
        parseCanisterRejectError(error) ?? 'Access requests failed to load',
      );
    } finally {
      this.loading.set(false);
    }
  }

  async loadTree(): Promise<void> {
    if (this.treeLoading() || this.tree().length > 0) return;

    this.treeLoading.set(true);
    try {
      this.tree.set(await this.#encryptedStorage().fsTree());
    } catch (error) {
      toast.error(parseCanisterRejectError(error) ?? 'File tree failed to load');
    } finally {
      this.treeLoading.set(false);
    }
  }

  optionalText(value: [] | [string]): string | null {
    return value[0] ?? null;
  }

  requesterProfile(principal: Principal): AccessProfile | null {
    return this.profiles().get(principal.toText()) ?? null;
  }

  async resolve(args: ResolveStorageAccessRequest): Promise<void> {
    this.#setBusy(args.requestId, true);
    const toastId = toast.loading('Updating access request...');
    try {
      await this.#encryptedStorage().resolveAccessRequest(args);
      toast.success('Access request updated', { id: toastId });
      await this.loadRequests();
    } catch (error) {
      toast.error(
        parseCanisterRejectError(error) ?? 'Access request update failed',
        {
          id: toastId,
        },
      );
    } finally {
      this.#setBusy(args.requestId, false);
    }
  }

  setRequests(requests: StorageAccessRequest[]): void {
    this.requests.set(requests);
    void this.#loadProfiles(requests);
  }

  setTree(tree: TreeNode[]): void {
    this.tree.set(tree);
  }

  shortPrincipal(principal: Principal): string {
    const value = principal.toText();
    return value.length > 18
      ? `${value.slice(0, 8)}...${value.slice(-6)}`
      : value;
  }

  statusIconName(status: StorageAccessRequestStatus): string {
    if ('pending' in status) return 'lucideClock';
    if ('approved' in status) return 'lucideCheck';
    if ('rejected' in status) return 'lucideX';
    return 'lucideSlash';
  }

  statusLabel(status: StorageAccessRequestStatus): string {
    if ('pending' in status) return 'Pending';
    if ('approved' in status) return 'Approved';
    if ('rejected' in status) return 'Rejected';
    return 'Cancelled';
  }

  async #loadProfiles(requests: StorageAccessRequest[]): Promise<void> {
    const principals = [
      ...new Map(
        requests.map((request) => [
          request.requester.toText(),
          request.requester,
        ]),
      ).values(),
    ];
    if (principals.length === 0) {
      this.profiles.set(new Map());
      return;
    }

    try {
      const lookups = await this.#mainActor().getPublicProfiles(principals);
      this.profiles.set(
        new Map(
          lookups.map(({ principal, profile }) => {
            const summary = profile[0];
            const principalId = principal.toText();
            if (!summary) {
              return [
                principalId,
                { title: this.shortPrincipal(principal) },
              ];
            }
            const displayName = summary.displayName[0];
            return [
              principalId,
              {
                avatarSrc: summary.avatarUrl[0],
                title: displayName ?? summary.username,
                username: displayName ? summary.username : undefined,
              },
            ];
          }),
        ),
      );
    } catch {
      this.profiles.set(new Map());
    }
  }

  #setBusy(requestId: bigint, busy: boolean): void {
    this.busyIds.update((current) => {
      const next = new Set(current);
      if (busy) {
        next.add(requestId);
      } else {
        next.delete(requestId);
      }
      return next;
    });
  }
}
