import {
  computed,
  effect,
  Injectable,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import type { Principal } from '@icp-sdk/core/principal';
import { toast } from '@spartan-ng/brain/sonner';
import { connect } from 'ngxtension/connect';
import {
  distinctUntilChanged,
  exhaustMap,
  filter,
  finalize,
  from,
  interval,
  map,
  repeat,
  share,
  takeUntil,
} from 'rxjs';

import { injectMainActor } from '../../injectors/main-actor';
import { parseCanisterRejectError } from '../../utils/parse-canister-reject-error';
import type { StorageCreationStatus, StorageInfo } from '../types/storage.types';
import { isStorageInProgress } from '../types/storage.types';
import { convertStorageInfoList } from '../utils/storage-converters';

const POLLING_INTERVAL_MS = 2000;

@Injectable({ providedIn: 'root' })
export class StoragesService {
  readonly #actor = injectMainActor();
  readonly storagesResource = resource({
    params: () => ({ actor: this.#actor() }),
    loader: async ({ params: { actor } }) => {
      const result = await actor.listStorages();
      return convertStorageInfoList(result);
    },
  });
  readonly storages = computed(() =>
    this.storagesResource.hasValue() ? this.storagesResource.value() : [],
  );
  /** Find the first storage that is in progress */
  readonly activeCreation = computed<StorageInfo | null>(() => {
    const storages = this.storages();
    return storages.find((s) => isStorageInProgress(s.status)) ?? null;
  });

  /**
   * Track the most recent creation (in progress, completed, or failed)
   * This is needed to show completion/error states before they disappear from activeCreation
   */
  readonly #lastCreationId = signal<bigint | null>(null);

  /**
   * Current creation status. Prefers the tracked creation id (set once the
   * user triggers a purchase) over "first in-progress" so we never lose the
   * thread as the record's status cycles through `Pending` or other states.
   * Falls back to first in-progress creation for external callers that
   * haven't registered a tracked id.
   */
  readonly creationStatus = computed<StorageCreationStatus | null>(() => {
    const storages = this.storages();
    const lastId = this.#lastCreationId();

    // Tracked id takes priority — it follows ONE specific creation through
    // every status transition (ProcessingPayment phases → Pending →
    // CheckingBalance → ... → Completed/Failed).
    if (lastId !== null) {
      const tracked = storages.find((s) => s.id === lastId);
      if (tracked) return tracked.status;
    }

    // No tracked id — fall back to the first actively-creating storage so
    // consumers that dropped in mid-flight still see something useful.
    const active = storages.find((s) => isStorageInProgress(s.status));
    if (active) {
      return active.status;
    }

    return null;
  });

  // ═══════════════════════════════════════════════════════════════
  // UPGRADE TRACKING
  // ═══════════════════════════════════════════════════════════════

  readonly hasActiveCreation = computed(() => {
    return this.activeCreation() !== null;
  });

  readonly #isCreating = signal(false);

  readonly isCreating = this.#isCreating.asReadonly();
  readonly #isLoading = signal(false);

  // ═══════════════════════════════════════════════════════════════
  // STORAGES LIST RESOURCE
  // ═══════════════════════════════════════════════════════════════

  readonly isLoading = this.#isLoading.asReadonly();

  readonly #isPolling = signal(false);

  // ═══════════════════════════════════════════════════════════════
  // COMPUTED FROM STORAGES
  // ═══════════════════════════════════════════════════════════════

  readonly isPolling = this.#isPolling.asReadonly();

  readonly #isUpgrading = signal(false);

  readonly isUpgrading = this.#isUpgrading.asReadonly();

  // ═══════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════

  readonly #lastUpgradeId = signal<bigint | null>(null);
  /** Current upgrade status - tracks both in-progress and recently completed */
  readonly upgradeStatus = computed<StorageCreationStatus | null>(() => {
    const lastId = this.#lastUpgradeId();
    if (lastId === null) return null;

    const tracked = this.storages().find((s) => s.id === lastId);
    if (!tracked) return null;

    return tracked.status;
  });

  constructor() {
    // Track active creation ID (separate effect to avoid infinite loop in computed)
    effect(() => {
      const storages = this.storages();
      const active = storages.find((s) => isStorageInProgress(s.status));
      if (active) {
        const currentId = untracked(() => this.#lastCreationId());
        if (currentId !== active.id) {
          this.#lastCreationId.set(active.id);
        }
      }
    });

    // Set up polling when there's an active creation
    const hasWorkInProgress$ = toObservable(this.hasActiveCreation).pipe(
      distinctUntilChanged(),
      share(),
    );

    connect(this.#isPolling, hasWorkInProgress$);

    const on$ = hasWorkInProgress$.pipe(filter((v) => v));
    const off$ = hasWorkInProgress$.pipe(filter((v) => !v));

    interval(POLLING_INTERVAL_MS)
      .pipe(
        exhaustMap(() => {
          const actor = this.#actor();
          this.#isLoading.set(true);

          return from(actor.listStorages()).pipe(
            map((result) => convertStorageInfoList(result)),
            finalize(() => this.#isLoading.set(false)),
          );
        }),
        takeUntil(off$),
        repeat({ delay: () => on$ }),
        takeUntilDestroyed(),
      )
      .subscribe((storages) => {
        this.storagesResource.set(storages);
      });
  }

  // ═══════════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Clear the tracked creation (call when dialog is closed or user starts a new creation)
   */
  clearTrackedCreation(): void {
    this.#lastCreationId.set(null);
  }

  /**
   * Clear the tracked upgrade (call when dialog is closed)
   */
  clearTrackedUpgrade(): void {
    this.#lastUpgradeId.set(null);
  }

  /**
   * Delete a failed storage record
   * @param storageId ID of the storage record to delete
   */
  async deleteStorage(storageId: bigint): Promise<void> {
    const actor = this.#actor();
    const toastId = toast.loading('Deleting storage record...');

    try {
      const result = await actor.deleteStorage(storageId);

      if ('err' in result) {
        const errorKey = Object.keys(result.err)[0];
        const errorMessages: Record<string, string> = {
          NotFound: 'Storage not found',
          NotOwner: 'You are not the owner of this storage',
          NotFailed: 'Only failed storages can be deleted',
        };
        const message = errorMessages[errorKey] ?? errorKey;
        toast.error(`Failed to delete: ${message}`, { id: toastId });
        throw new Error(errorKey);
      }

      toast.success('Storage record deleted', { id: toastId });
      this.storagesResource.reload();
    } catch (error) {
      console.error(error);
      const errorMessage =
        parseCanisterRejectError(error) ?? 'An error has occurred';
      toast.error(`Failed to delete: ${errorMessage}`, { id: toastId });
      throw error;
    }
  }

  /**
   * Reload storages list from backend
   */
  reload(): void {
    this.storagesResource.reload();
  }

  /**
   * Resume a failed storage creation without charging the license again.
   * The backend reuses the existing paid creation record and continues from
   * the last safe checkpoint.
   */
  async resumeFailedStorage(storageId: bigint): Promise<void> {
    const actor = this.#actor();
    const toastId = toast.loading('Resuming storage setup...');

    try {
      const result = await actor.recoverFailedStorage(storageId, { resume: null });

      if ('err' in result) {
        toast.error(`Resume failed: ${result.err}`, { id: toastId });
        throw new Error(result.err);
      }

      this.#lastCreationId.set(storageId);
      toast.success('Storage setup resumed', { id: toastId });
      this.storagesResource.reload();
    } catch (error) {
      console.error(error);
      const errorMessage = parseCanisterRejectError(error);
      if (errorMessage) {
        toast.error(`Resume failed: ${errorMessage}`, { id: toastId });
      }
      throw error;
    }
  }

  /**
   * Register a creation id returned by `purchaseLicenseAndCreateStorage`.
   * The service then follows this specific record through every status
   * transition, regardless of intermediate states like `Pending`.
   */
  trackCreation(creationId: bigint): void {
    this.#lastCreationId.set(creationId);
    // Force an immediate reload so the UI doesn't wait up to 2s for the
    // next polling tick to see the new record.
    this.storagesResource.reload();
  }

  /**
   * Upgrade an existing storage canister.
   * Backend determines what to update (WASM, frontend, or both) automatically.
   * @param storageId ID of the storage record
   * @param canisterId Principal of the canister to upgrade
   */
  async upgradeStorage(
    storageId: bigint,
    canisterId: Principal,
  ): Promise<void> {
    if (this.#isUpgrading()) {
      throw new Error('Upgrade already in progress');
    }

    this.#isUpgrading.set(true);
    this.#lastUpgradeId.set(storageId);
    const actor = this.#actor();

    try {
      const result = await actor.upgradeStorage(canisterId);

      if ('err' in result) {
        const errorKey = Object.keys(result.err)[0];
        const errorMessages: Record<string, string> = {
          AlreadyUpgrading: 'An upgrade is already in progress',
          NotFound: 'Storage not found',
          NotOwner: 'You are not the owner of this storage',
          NoUpdateAvailable: 'No update available',
          UpToDate: 'Storage is already up to date',
        };
        const message = errorMessages[errorKey] ?? errorKey;
        toast.error(`Upgrade failed: ${message}`);
        throw new Error(errorKey);
      }

      toast.success('Storage upgrade started');
      this.storagesResource.reload();
    } catch (error) {
      console.error(error);
      const errorMessage =
        parseCanisterRejectError(error) ?? 'An error has occurred';
      toast.error(`Upgrade failed: ${errorMessage}`);
      throw error;
    } finally {
      this.#isUpgrading.set(false);
    }
  }

}
