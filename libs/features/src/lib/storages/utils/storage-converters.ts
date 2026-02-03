import { Principal } from '@icp-sdk/core/principal';
import { match, P } from 'ts-pattern';

import { timeInNanosToDate } from '@rabbithole/core';
import type {
  CreationStatus,
  Progress as ProgressCandid,
  StorageInfo as StorageInfoCandid,
} from '@rabbithole/declarations';

import type {
  Progress,
  StorageCreationStatus,
  StorageInfo,
} from '../types';

/**
 * Convert Candid CreationStatus to TypeScript-friendly StorageCreationStatus
 */
export function convertCreationStatus(
  status: CreationStatus,
): StorageCreationStatus {
  return match(status)
    .returnType<StorageCreationStatus>()
    .with({ Pending: P._ }, () => ({ type: 'Pending' }))
    .with({ CheckingAllowance: P._ }, () => ({ type: 'CheckingAllowance' }))
    .with({ TransferringICP: P.select() }, ({ amount }) => ({
      amount,
      type: 'TransferringICP',
    }))
    .with({ NotifyingCMC: P.select() }, ({ blockIndex }) => ({
      blockIndex,
      type: 'NotifyingCMC',
    }))
    .with({ CanisterCreated: P.select() }, ({ canisterId }) => ({
      canisterId,
      type: 'CanisterCreated',
    }))
    .with({ InstallingWasm: P.select() }, ({ canisterId, progress }) => ({
      canisterId,
      progress: convertProgress(progress),
      type: 'InstallingWasm',
    }))
    .with({ UploadingFrontend: P.select() }, ({ canisterId, progress }) => ({
      canisterId,
      progress: convertProgress(progress),
      type: 'UploadingFrontend',
    }))
    .with({ UpdatingControllers: P.select() }, ({ canisterId }) => ({
      canisterId,
      type: 'UpdatingControllers',
    }))
    .with({ Completed: P.select() }, ({ canisterId }) => ({
      canisterId,
      type: 'Completed',
    }))
    .with({ Failed: P.select() }, (message) => ({
      message,
      type: 'Failed',
    }))
    .exhaustive();
}

/**
 * Convert Candid StorageInfo to TypeScript-friendly StorageInfo
 */
export function convertStorageInfo(
  record: StorageInfoCandid,
): StorageInfo {
  const canisterId = record.canisterId.length > 0 ? record.canisterId[0] : undefined;
  const completedAt = record.completedAt.length > 0 ? record.completedAt[0] : undefined;

  return {
    id: record.id,
    canisterId,
    status: convertCreationStatus(record.status),
    releaseTag: record.releaseTag,
    createdAt: timeInNanosToDate(record.createdAt),
    completedAt: completedAt ? timeInNanosToDate(completedAt) : undefined,
  };
}

/**
 * Convert array of Candid StorageInfo to TypeScript-friendly array
 */
export function convertStorageInfoList(
  records: StorageInfoCandid[],
): StorageInfo[] {
  return records.map(convertStorageInfo);
}

/**
 * Get canister ID from storage info if available
 */
export function getStorageCanisterId(
  record: StorageInfo,
): Principal | undefined {
  // First check record's canisterId field
  if (record.canisterId) {
    return record.canisterId;
  }

  // Then check status for canisterId
  const status = record.status;
  if (
    status.type === 'CanisterCreated' ||
    status.type === 'InstallingWasm' ||
    status.type === 'UploadingFrontend' ||
    status.type === 'UpdatingControllers' ||
    status.type === 'Completed'
  ) {
    return status.canisterId;
  }

  return undefined;
}

/**
 * Convert Candid Progress to TypeScript-friendly Progress
 */
function convertProgress(progress: ProgressCandid): Progress {
  return {
    processed: Number(progress.processed),
    total: Number(progress.total),
  };
}
