import { fromNullable } from '@dfinity/utils';
import { Principal } from '@icp-sdk/core/principal';
import { match, P } from 'ts-pattern';

import type {
  CreationStatus,
  Progress as ProgressCandid,
  StorageInfo as StorageInfoCandid,
  UpdateInfo as UpdateInfoCandid,
} from '@rabbithole/declarations';

import { timeInNanosToDate } from '../../utils/time';
import type {
  Progress,
  StorageCreationStatus,
  StorageInfo,
  UpdateInfo,
} from '../types/storage.types';

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
    .with({ UpgradingWasm: P.select() }, ({ canisterId, progress }) => ({
      canisterId,
      progress: convertProgress(progress),
      type: 'UpgradingWasm',
    }))
    .with({ UpgradingFrontend: P.select() }, ({ canisterId, progress }) => ({
      canisterId,
      progress: convertProgress(progress),
      type: 'UpgradingFrontend',
    }))
    .with({ RevokingInstallerPermission: P.select() }, ({ canisterId }) => ({
      canisterId,
      type: 'RevokingInstallerPermission',
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
  const canisterId = fromNullable(record.canisterId);
  const completedAt = fromNullable(record.completedAt);
  const updateInfo = fromNullable(record.updateAvailable);

  return {
    id: record.id,
    canisterId,
    status: convertCreationStatus(record.status),
    releaseTag: record.releaseTag,
    createdAt: timeInNanosToDate(record.createdAt),
    completedAt: completedAt ? timeInNanosToDate(completedAt) : undefined,
    updateAvailable: updateInfo ? convertUpdateInfo(updateInfo) : undefined,
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
    status.type === 'UpgradingWasm' ||
    status.type === 'UploadingFrontend' ||
    status.type === 'UpgradingFrontend' ||
    status.type === 'RevokingInstallerPermission' ||
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

/**
 * Convert Candid UpdateInfo to TypeScript-friendly UpdateInfo
 */
function convertUpdateInfo(info: UpdateInfoCandid): UpdateInfo {
  return {
    currentWasmHash: fromNullable(info.currentWasmHash) as Uint8Array | undefined,
    availableWasmHash: fromNullable(info.availableWasmHash) as Uint8Array | undefined,
    currentReleaseTag: fromNullable(info.currentReleaseTag),
    availableReleaseTag: fromNullable(info.availableReleaseTag),
    wasmUpdateAvailable: info.wasmUpdateAvailable,
    frontendUpdateAvailable: info.frontendUpdateAvailable,
  };
}
