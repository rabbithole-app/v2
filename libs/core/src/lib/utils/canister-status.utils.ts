import { Principal } from '@dfinity/principal';
import { fromNullable, uint8ArrayToHexString } from '@dfinity/utils';
import type { CanisterStatusResponse } from '@icp-sdk/canisters/ic-management';

/**
 * Converts variant status to a string union type
 */
export type CanisterStatus = 'running' | 'stopped' | 'stopping';

/**
 * Converts canister_status result to a TypeScript-friendly format
 */
export interface ParsedCanisterStatus {
  certifiedData: string | null;
  controller: Principal;
  cycles: bigint;
  freezingThreshold: bigint;
  idleCyclesBurnedPerDay: bigint;
  memorySize: number;
  moduleHash: string | null;
  reservedCycles: bigint;
  settings: {
    computeAllocation: bigint;
    controllers: Principal[];
    freezingThreshold: bigint;
    logVisibility: 'controllers' | 'public';
    memoryAllocation: bigint;
    reservedCyclesLimit: bigint;
  };
  status: CanisterStatus;
}

/**
 * Converts CanisterStatusResponse to ParsedCanisterStatus
 */
export function parseCanisterStatus(
  response: CanisterStatusResponse,
): ParsedCanisterStatus {
  const r = response as {
    cycles: bigint;
    idle_cycles_burned_per_day: bigint;
    memory_size: bigint;
    module_hash: [] | [number[] | Uint8Array];
    reserved_cycles: bigint;
    settings: {
      compute_allocation: bigint;
      controllers: Array<Principal>;
      freezing_threshold: bigint;
      log_visibility: { controllers: null } | { public: null };
      memory_allocation: bigint;
      reserved_cycles_limit: bigint;
    };
    status: { running: null } | { stopped: null } | { stopping: null };
  };

  return {
    certifiedData: null, // certified_data is not present in canister_status_result
    controller: r.settings.controllers[0] ?? Principal.anonymous(),
    cycles: r.cycles,
    freezingThreshold: r.settings.freezing_threshold,
    idleCyclesBurnedPerDay: r.idle_cycles_burned_per_day,
    memorySize: Number(r.memory_size),
    moduleHash: parseOptionalBlob(r.module_hash),
    reservedCycles: r.reserved_cycles,
    settings: {
      computeAllocation: r.settings.compute_allocation,
      controllers: r.settings.controllers,
      freezingThreshold: r.settings.freezing_threshold,
      logVisibility:
        'controllers' in r.settings.log_visibility ? 'controllers' : 'public',
      memoryAllocation: r.settings.memory_allocation,
      reservedCyclesLimit: r.settings.reserved_cycles_limit,
    },
    status: (Object.keys(r.status)[0] as CanisterStatus) ?? 'stopped',
  };
}

/**
 * Converts optional blob to hex string or null
 */
function parseOptionalBlob(blob: [] | [number[] | Uint8Array]): string | null {
  const value = fromNullable(blob);
  if (!value) return null;
  const uint8Array =
    value instanceof Uint8Array ? value : new Uint8Array(value);
  return uint8ArrayToHexString(uint8Array);
}
