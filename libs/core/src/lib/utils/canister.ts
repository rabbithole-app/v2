import type { IcManagementDid } from '@icp-sdk/canisters/ic-management';
import { fromNullable, uint8ArrayToHexString } from '@dfinity/utils';

import { ONE_DAY } from '../constants';
import {
  CanisterDataInfo,
  CanisterLogVisibility,
  CanisterStatus,
} from '../types';

const toStatus = (
  status: { running: null } | { stopped: null } | { stopping: null },
): CanisterStatus =>
  'stopped' in status && status.stopped === null
    ? 'stopped'
    : 'stopping' in status && status.stopping === null
      ? 'stopping'
      : 'running';

const toLogVisibility = (
  log_visibility: IcManagementDid.canister_status_result['settings']['log_visibility'],
): CanisterLogVisibility =>
  'controllers' in log_visibility ? 'controllers' : 'public';

/**
 * Converts canister_status_result to CanisterDataInfo
 */
export function canisterStatus(
  response: IcManagementDid.canister_status_result,
): CanisterDataInfo {
  const {
    cycles,
    status,
    memory_size: memorySize,
    ready_for_migration: readyForMigration,
    version,
    reserved_cycles: reservedCycles,
    module_hash,
    idle_cycles_burned_per_day: idleCyclesBurnedPerDay,
    query_stats: {
      num_instructions_total: numInstructionsTotal,
      num_calls_total: numCallsTotal,
      request_payload_bytes_total: requestPayloadBytesTotal,
      response_payload_bytes_total: responsePayloadBytesTotal,
    },
    memory_metrics: {
      wasm_binary_size: wasmBinarySize,
      wasm_chunk_store_size: wasmChunkStoreSize,
      canister_history_size: canisterHistorySize,
      stable_memory_size: stableMemorySize,
      snapshots_size: snapshotsSize,
      wasm_memory_size: wasmMemorySize,
      global_memory_size: globalMemorySize,
      custom_sections_size: customSectionsSize,
    },
    settings: {
      freezing_threshold: freezingThreshold,
      controllers,
      reserved_cycles_limit: reservedCyclesLimit,
      log_visibility,
      wasm_memory_limit: wasmMemoryLimit,
      memory_allocation: memoryAllocation,
      compute_allocation: computeAllocation,
    },
  } = response;

  const moduleHash = fromNullable(module_hash);

  return {
    cycles,
    status: toStatus(status),
    memorySize,
    idleCyclesBurnedPerDay,
    ...(moduleHash ? { moduleHash: uint8ArrayToHexString(moduleHash) } : {}),
    readyForMigration,
    reservedCycles,
    version,
    queryStats: {
      numInstructionsTotal,
      numCallsTotal,
      requestPayloadBytesTotal,
      responsePayloadBytesTotal,
    },
    memoryMetrics: {
      wasmBinarySize,
      wasmChunkStoreSize,
      canisterHistorySize,
      stableMemorySize,
      snapshotsSize,
      wasmMemorySize,
      globalMemorySize,
      customSectionsSize,
    },
    settings: {
      freezingThreshold,
      controllers,
      reservedCyclesLimit,
      logVisibility: toLogVisibility(log_visibility),
      wasmMemoryLimit,
      memoryAllocation,
      computeAllocation,
    },
  };
}

export const cyclesNeededForFreezingThreshold = (
  canisterInfo: CanisterDataInfo | undefined,
): bigint =>
  ((canisterInfo?.idleCyclesBurnedPerDay ?? 0n) *
    (canisterInfo?.settings.freezingThreshold ?? 0n)) /
  ONE_DAY;

export const lacksCyclesForFreezingThreshold = (params: {
  canisterInfo: CanisterDataInfo;
  freezingThreshold: bigint;
}): boolean => !hasEnoughCyclesForFreezingThreshold(params);

export const hasEnoughCyclesForFreezingThreshold = ({
  canisterInfo,
  freezingThreshold,
}: {
  canisterInfo: CanisterDataInfo;
  freezingThreshold: bigint;
}): boolean =>
  canisterInfo.cycles >=
  ((canisterInfo.idleCyclesBurnedPerDay ?? 0n) * freezingThreshold) / ONE_DAY;
