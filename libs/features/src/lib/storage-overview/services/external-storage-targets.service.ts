import { computed, Injectable, resource } from '@angular/core';

import { parseCanisterRejectError } from '@rabbithole/core';
import { injectEncryptedStorageActor } from '@rabbithole/core/storage-runtime';
import type {
  ConfigureExternalStorageTargetArgs,
  ExternalBlobReplica,
  ExternalStorageCleanupStatus,
  ExternalStorageDeleteTaskView,
  ExternalStorageTargetView,
  StorageReleaseState,
  StorageStatus,
} from '@rabbithole/declarations/encrypted-storage';

export interface ExternalStorageCleanupSnapshot {
  deleteTasks: ExternalStorageDeleteTaskView[];
  replicas: ExternalBlobReplica[];
  summary: ExternalStorageCleanupStatus;
}

export interface ExternalStorageTargetsSnapshot {
  active: ExternalStorageTargetView | null;
  targets: ExternalStorageTargetView[];
}

type StorageResultLike<T> =
  | { err: { code?: unknown; message?: string } }
  | { ok: T };

@Injectable()
export class ExternalStorageTargetsService {
  readonly #actor = injectEncryptedStorageActor();

  readonly targetsResource = resource({
    params: () => this.#actor(),
    loader: async ({
      params: actor,
    }): Promise<ExternalStorageTargetsSnapshot> => {
      // `TargetStatus.Active` is a lifecycle state shared by every enabled
      // target; the canister's active pointer decides where uploads go.
      const [targets, active] = await Promise.all([
        actor.listExternalStorageTargets().then(unwrapStorageResult),
        actor.getActiveExternalStorageTarget().then(unwrapStorageResult),
      ]);

      return {
        active: active[0] ?? null,
        targets,
      };
    },
  });

  readonly snapshot = computed<ExternalStorageTargetsSnapshot | null>(() =>
    this.targetsResource.hasValue() ? this.targetsResource.value() : null,
  );

  readonly activeTarget = computed(() => this.snapshot()?.active ?? null);

  readonly cleanupResource = resource({
    params: () => this.#actor(),
    loader: async ({
      params: actor,
    }): Promise<ExternalStorageCleanupSnapshot> => {
      try {
        return unwrapStorageResult(
          await actor.getExternalStorageCleanupStatus(),
        );
      } catch (error) {
        // Storage canisters released before the cleanup summary respond with
        // a smaller record that fails candid decoding; show an empty queue
        // until the vault is upgraded.
        if (!isCandidDecodeError(error)) throw error;
        return {
          deleteTasks: [],
          replicas: [],
          summary: emptyCleanupSummary(),
        };
      }
    },
  });

  readonly cleanup = computed<ExternalStorageCleanupSnapshot | null>(() =>
    this.cleanupResource.hasValue() ? this.cleanupResource.value() : null,
  );
  readonly releaseStateResource = resource({
    params: () => this.#actor(),
    loader: async ({ params: actor }): Promise<StorageReleaseState> =>
      await actor.getStorageReleaseState(),
  });

  readonly releaseTag = computed<string | null>(() =>
    this.releaseStateResource.hasValue()
      ? (this.releaseStateResource.value().releaseTag[0] ?? null)
      : null,
  );

  readonly storageStatusResource = resource({
    params: () => this.#actor(),
    loader: async ({ params: actor }): Promise<StorageStatus | null> => {
      try {
        return await actor.getStatus();
      } catch (error) {
        // Vaults released before file/directory counts respond with a smaller
        // record that fails candid decoding; show placeholders until upgraded.
        if (isCandidDecodeError(error)) return null;
        throw error;
      }
    },
  });

  readonly storageStatus = computed<StorageStatus | null>(() =>
    this.storageStatusResource.hasValue()
      ? this.storageStatusResource.value()
      : null,
  );

  readonly targets = computed(() => this.snapshot()?.targets ?? []);

  async configure(
    args: ConfigureExternalStorageTargetArgs,
  ): Promise<ExternalStorageTargetView> {
    const target = unwrapStorageResult(
      await this.#actor().configureExternalStorageTarget(args),
    );
    this.refresh();
    return target;
  }

  describeError(error: unknown): string {
    return (
      parseCanisterRejectError(error) ??
      (error instanceof Error ? error.message : 'Storage target request failed')
    );
  }

  async disconnect(targetId: string): Promise<void> {
    unwrapStorageResult(
      await this.#actor().disconnectExternalStorageTarget({ targetId }),
    );
    this.refresh();
  }

  refresh(): void {
    this.targetsResource.reload();
    this.cleanupResource.reload();
    this.storageStatusResource.reload();
  }

  refreshCleanup(): void {
    this.cleanupResource.reload();
  }

  async revalidate(targetId: string): Promise<ExternalStorageTargetView> {
    const target = unwrapStorageResult(
      await this.#actor().revalidateExternalStorageTarget(targetId),
    );
    this.refresh();
    return target;
  }
}

function emptyCleanupSummary(): ExternalStorageCleanupStatus {
  return {
    activeReplicas: 0n,
    cancelledTasks: 0n,
    credentialBlockedTargetIds: [],
    deletePendingReplicas: 0n,
    deletedReplicas: 0n,
    doneTasks: 0n,
    missingReplicas: 0n,
    nextAttemptAt: [],
    pendingTasks: 0n,
    pendingUploadSessions: 0n,
    runningTasks: 0n,
  };
}

function isCandidDecodeError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /Cannot find required field|Fail to decode/i.test(error.message)
  );
}

function storageErrorCodeLabel(code: unknown): string | null {
  if (!code || typeof code !== 'object') return null;
  const [label] = Object.keys(code);
  return label ?? null;
}

function unwrapStorageResult<T>(result: StorageResultLike<T>): T {
  if ('err' in result) {
    const { code, message } = result.err;
    const label = storageErrorCodeLabel(code);
    const fallback = message ?? 'Storage operation failed';

    throw new Error(label ? `[${label}] ${fallback}` : fallback);
  }

  return result.ok;
}
