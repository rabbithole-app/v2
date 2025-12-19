import { Principal } from '@icp-sdk/core/principal';

export type CanisterDataInfo = Omit<CanisterInfo, 'canisterId'>;

export interface CanisterInfo {
  canisterId: string;
  cycles: bigint;
  idleCyclesBurnedPerDay?: bigint;
  memoryMetrics: CanisterMemoryMetrics;
  memorySize: bigint;
  moduleHash?: string;
  queryStats: CanisterQueryStats;
  readyForMigration: boolean;
  reservedCycles: bigint;
  settings: CanisterSettings;
  status: CanisterStatus;
  version: bigint;
}

export type CanisterLogVisibility = 'controllers' | 'public';

export interface CanisterMemoryMetrics {
  canisterHistorySize: bigint;
  customSectionsSize: bigint;
  globalMemorySize: bigint;
  snapshotsSize: bigint;
  stableMemorySize: bigint;
  wasmBinarySize: bigint;
  wasmChunkStoreSize: bigint;
  wasmMemorySize: bigint;
}

export interface CanisterQueryStats {
  numCallsTotal: bigint;
  numInstructionsTotal: bigint;
  requestPayloadBytesTotal: bigint;
  responsePayloadBytesTotal: bigint;
}

export interface CanisterSettings {
  computeAllocation: bigint;
  controllers: Principal[];
  freezingThreshold: bigint;
  logVisibility: CanisterLogVisibility;
  memoryAllocation: bigint;
  reservedCyclesLimit: bigint;
  wasmMemoryLimit: bigint;
}

export type CanisterStatus = 'running' | 'stopped' | 'stopping';

export type CanisterSyncStatus = 'error' | 'loading' | 'synced' | 'syncing';

export type Snapshot = {
  id: string;
  totalSize: bigint;
  takenAtTimestamp: Date;
};
