import { computed, inject, Injectable, resource, signal } from '@angular/core';
import { hexStringToUint8Array, uint8ArrayToHexString } from '@dfinity/utils';
import {
  IcManagementCanister,
  type IcManagementDid,
  OptionSnapshotParams,
  SnapshotIdText,
  SnapshotParams,
} from '@icp-sdk/canisters/ic-management';
import { Principal } from '@icp-sdk/core/principal';
import { toast } from 'ngx-sonner';

import { AUTH_SERVICE } from '@rabbithole/auth';
import {
  CanisterDataInfo,
  canisterStatus,
  ENCRYPTED_STORAGE_CANISTER_ID,
  injectHttpAgent,
  Snapshot,
  timeInNanosToDate,
} from '@rabbithole/core';

type RestoreSnapshotStatus = 'idle' | 'restoring' | 'starting' | 'stopping';
type State = {
  loading: {
    adding: string[];
    removing: string[];
  };
  snapshots: {
    deleting: string[];
    replacing: string | null;
    restoreStatus: RestoreSnapshotStatus;
    takeStatus: TakeSnapshotStatus;
  };
};

type TakeSnapshotStatus = 'idle' | 'starting' | 'stopping' | 'taking';

@Injectable()
export class ICManagementService {
  #authService = inject(AUTH_SERVICE);
  #canisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID);
  #httpAgent = injectHttpAgent();
  #icManagement = computed(() => {
    const agent = this.#httpAgent();
    return IcManagementCanister.create({ agent });
  });
  canisterStatus = resource<CanisterDataInfo, IcManagementCanister>({
    params: () => this.#icManagement(),
    loader: async ({ params: icManagement }) => {
      const pid = this.#authService.identity().getPrincipal();

      if (pid.isAnonymous()) {
        throw new Error('Anonymous user cannot access IC management');
      }

      const result = await icManagement.canisterStatus({
        canisterId: this.#canisterId,
      });

      return canisterStatus(result as IcManagementDid.canister_status_result);
    },
  });
  snapshots = resource<Snapshot[], IcManagementCanister>({
    params: () => this.#icManagement(),
    loader: async ({ params: icManagement }) => {
      const pid = this.#authService.identity().getPrincipal();

      if (pid.isAnonymous()) {
        throw new Error('Anonymous user cannot access IC management');
      }

      const result = (await icManagement.listCanisterSnapshots({
        canisterId: this.#canisterId,
      })) as Array<{
        id: Uint8Array;
        taken_at_timestamp: bigint;
        total_size: bigint;
      }>;

      return result.map((snapshot) => ({
        id: uint8ArrayToHexString(snapshot.id),
        takenAtTimestamp: timeInNanosToDate(snapshot.taken_at_timestamp),
        totalSize: snapshot.total_size,
      }));
    },
  });
  #state = signal<State>({
    loading: {
      adding: [],
      removing: [],
    },
    snapshots: {
      deleting: [],
      replacing: null,
      restoreStatus: 'idle',
      takeStatus: 'idle',
    },
  });
  state = this.#state.asReadonly();

  async addController(principal: Principal) {
    if (this.canisterStatus.hasValue()) {
      const controllers = this.canisterStatus
        .value()
        .settings.controllers.concat(principal)
        .map((p) => p.toText());
      const id = toast.loading('Adding controller...');
      this.#state.update((state) => ({
        ...state,
        loading: {
          ...state.loading,
          adding: [...state.loading.adding, principal.toText()],
        },
      }));

      try {
        await this.#icManagement().updateSettings({
          canisterId: this.#canisterId,
          settings: {
            controllers,
          },
        });
        toast.success('Controller added successfully', { id });
        this.canisterStatus.reload();
      } catch (error) {
        toast.error('Failed to add controller', { id });
        console.error(error);
      } finally {
        this.#state.update((state) => ({
          ...state,
          loading: {
            ...state.loading,
            adding: state.loading.adding.filter(
              (p) => p !== principal.toText(),
            ),
          },
        }));
      }
    }
  }

  async deleteSnapshot(
    snapshotId: IcManagementDid.snapshot_id | SnapshotIdText,
  ) {
    const pid = this.#authService.identity().getPrincipal();

    if (pid.isAnonymous()) {
      throw new Error('Anonymous user cannot access IC management');
    }

    const snapshotIdString =
      typeof snapshotId === 'string'
        ? snapshotId
        : uint8ArrayToHexString(snapshotId);
    const toastId = toast.loading('Deleting snapshot...');

    this.#state.update((state) => ({
      ...state,
      snapshots: {
        ...state.snapshots,
        deleting: [...state.snapshots.deleting, snapshotIdString],
      },
    }));

    try {
      const params: SnapshotParams = {
        canisterId: this.#canisterId,
        snapshotId:
          typeof snapshotId === 'string'
            ? hexStringToUint8Array(snapshotId)
            : snapshotId,
      };

      await this.#icManagement().deleteCanisterSnapshot(params);
      toast.success('Snapshot deleted successfully', { id: toastId });
      this.snapshots.reload();
    } catch (error) {
      toast.error('Failed to delete snapshot', { id: toastId });
      console.error(error);
    } finally {
      this.#state.update((state) => ({
        ...state,
        snapshots: {
          ...state.snapshots,
          deleting: state.snapshots.deleting.filter(
            (id) => id !== snapshotIdString,
          ),
        },
      }));
    }
  }

  async loadSnapshot(snapshotId: IcManagementDid.snapshot_id | SnapshotIdText) {
    const pid = this.#authService.identity().getPrincipal();

    if (pid.isAnonymous()) {
      throw new Error('Anonymous user cannot access IC management');
    }

    const toastId = toast.loading('Stopping canister...');

    try {
      // Step 1: Stop canister
      this.#state.update((state) => ({
        ...state,
        snapshots: {
          ...state.snapshots,
          restoreStatus: 'stopping',
        },
      }));
      await this.#icManagement().stopCanister(this.#canisterId);

      // Step 2: Load snapshot
      this.#state.update((state) => ({
        ...state,
        snapshots: {
          ...state.snapshots,
          restoreStatus: 'restoring',
        },
      }));

      const params: Required<OptionSnapshotParams> = {
        canisterId: this.#canisterId,
        snapshotId:
          typeof snapshotId === 'string'
            ? hexStringToUint8Array(snapshotId)
            : snapshotId,
      };

      toast.loading('Restoring canister...', { id: toastId });
      await this.#icManagement().loadCanisterSnapshot(params);

      // Step 3: Start canister
      this.#state.update((state) => ({
        ...state,
        snapshots: {
          ...state.snapshots,
          restoreStatus: 'starting',
        },
      }));

      toast.loading('Starting canister...', { id: toastId });
      await this.#icManagement().startCanister(this.#canisterId);

      toast.success('Snapshot loaded successfully', { id: toastId });
      this.snapshots.reload();
      this.canisterStatus.reload();
    } catch (error) {
      toast.error('Failed to load snapshot', { id: toastId });
      console.error(error);
    } finally {
      this.#state.update((state) => ({
        ...state,
        snapshots: {
          ...state.snapshots,
          restoreStatus: 'idle',
        },
      }));
    }
  }

  async removeController(principal: Principal) {
    if (this.canisterStatus.hasValue()) {
      const controllers = this.canisterStatus
        .value()
        .settings.controllers.filter((p) => p.toText() !== principal.toText())
        .map((p) => p.toText());

      const id = toast.loading('Removing controller...');
      this.#state.update((state) => ({
        ...state,
        loading: {
          ...state.loading,
          removing: [...state.loading.removing, principal.toText()],
        },
      }));

      try {
        await this.#icManagement().updateSettings({
          canisterId: this.#canisterId,
          settings: {
            controllers,
          },
        });
        toast.success('Controller removed successfully', { id });
        this.canisterStatus.reload();
      } catch (error) {
        toast.error('Failed to remove controller', { id });
        console.error(error);
      } finally {
        this.#state.update((state) => ({
          ...state,
          loading: {
            ...state.loading,
            removing: state.loading.removing.filter(
              (p) => p !== principal.toText(),
            ),
          },
        }));
      }
    }
  }

  async takeSnapshot(
    snapshotId?: IcManagementDid.snapshot_id | SnapshotIdText,
  ) {
    const pid = this.#authService.identity().getPrincipal();

    if (pid.isAnonymous()) {
      throw new Error('Anonymous user cannot access IC management');
    }

    const toastId = toast.loading('Stopping canister...');

    try {
      // Step 1: Stop canister
      this.#state.update((state) => ({
        ...state,
        snapshots: {
          ...state.snapshots,
          takeStatus: 'stopping',
        },
      }));
      await this.#icManagement().stopCanister(this.#canisterId);

      // Step 2: Take snapshot
      this.#state.update((state) => ({
        ...state,
        snapshots: {
          ...state.snapshots,
          takeStatus: 'taking',
        },
      }));

      const params: OptionSnapshotParams = {
        canisterId: this.#canisterId,
      };

      if (snapshotId) {
        params.snapshotId =
          typeof snapshotId === 'string'
            ? hexStringToUint8Array(snapshotId)
            : snapshotId;
      }

      toast.loading(
        snapshotId ? 'Replacing snapshot...' : 'Taking snapshot...',
        { id: toastId },
      );
      await this.#icManagement().takeCanisterSnapshot(params);

      // Step 3: Start canister
      this.#state.update((state) => ({
        ...state,
        snapshots: {
          ...state.snapshots,
          takeStatus: 'starting',
        },
      }));

      toast.loading('Starting canister...', { id: toastId });
      await this.#icManagement().startCanister(this.#canisterId);

      toast.success(
        snapshotId
          ? 'Snapshot replaced successfully'
          : 'Snapshot taken successfully',
        { id: toastId },
      );
      this.snapshots.reload();
    } catch (error) {
      toast.error(
        snapshotId ? 'Failed to replace snapshot' : 'Failed to take snapshot',
        { id: toastId },
      );
      console.error(error);
    } finally {
      this.#state.update((state) => ({
        ...state,
        snapshots: {
          ...state.snapshots,
          takeStatus: 'idle',
        },
      }));
    }
  }
}
