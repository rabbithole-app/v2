import { fromNullable } from '@dfinity/utils';
import { Principal } from '@icp-sdk/core/principal';
import { match, P } from 'ts-pattern';

import type {
  CreationStatus,
  FrontendInstallDiagnostics as FrontendInstallDiagnosticsCandid,
  PaymentPhase as PaymentPhaseCandid,
  Progress as ProgressCandid,
  StorageInfo as StorageInfoCandid,
  UpdateInfo as UpdateInfoCandid,
} from '@rabbithole/declarations/backend';

import { timeInNanosToDate } from '../../utils/time';
import type {
  PaymentPhase,
  FrontendInstallDiagnostics,
  Progress,
  StorageCreationStatus,
  StorageInfo,
  TokenId,
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
    .with({ ProcessingPayment: P.select() }, (phase) => ({
      phase: convertPaymentPhase(phase),
      type: 'ProcessingPayment',
    }))
    .with({ Pending: P._ }, () => ({ type: 'Pending' }))
    .with({ CheckingBalance: P._ }, () => ({ type: 'CheckingBalance' }))
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
  const frontendInstallDiagnostics = fromNullable(record.frontendInstallDiagnostics);

  return {
    id: record.id,
    canisterId,
    status: convertCreationStatus(record.status),
    releaseTag: record.releaseTag,
    createdAt: timeInNanosToDate(record.createdAt),
    completedAt: completedAt ? timeInNanosToDate(completedAt) : undefined,
    frontendInstallDiagnostics: frontendInstallDiagnostics
      ? convertFrontendInstallDiagnostics(frontendInstallDiagnostics)
      : undefined,
    updateAvailable: updateInfo ? convertUpdateInfo(updateInfo) : undefined,
    lastUpgradeError: fromNullable(record.lastUpgradeError),
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
 * Convert Candid PaymentPhase to TypeScript-friendly PaymentPhase.
 */
function convertPaymentPhase(phase: PaymentPhaseCandid): PaymentPhase {
  return match(phase)
    .returnType<PaymentPhase>()
    .with({ Starting: P._ }, () => ({ type: 'Starting' }))
    .with({ FetchingRates: P._ }, () => ({ type: 'FetchingRates' }))
    .with({ CheckingBalances: P._ }, () => ({ type: 'CheckingBalances' }))
    .with({ Charging: P.select() }, ({ tokenId, amount }) => ({
      type: 'Charging',
      amount,
      tokenId: Object.keys(tokenId)[0] as TokenId,
    }))
    .with({ RecordingLicense: P._ }, () => ({ type: 'RecordingLicense' }))
    .with({ Activating: P._ }, () => ({ type: 'Activating' }))
    .with({ Queueing: P._ }, () => ({ type: 'Queueing' }))
    .exhaustive();
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

function convertFrontendInstallDiagnostics(
  diagnostics: FrontendInstallDiagnosticsCandid,
): FrontendInstallDiagnostics {
  const completedAt = fromNullable(diagnostics.completedAt);
  return {
    batchesProcessed: diagnostics.batchesProcessed,
    batchesTotal: diagnostics.batchesTotal,
    changedDeletedFiles: diagnostics.changedDeletedFiles,
    completedAt: completedAt ? timeInNanosToDate(completedAt) : undefined,
    error: fromNullable(diagnostics.error),
    processedBytes: diagnostics.processedBytes,
    processedFiles: diagnostics.processedFiles,
    skippedBytes: diagnostics.skippedBytes,
    skippedFiles: diagnostics.skippedFiles,
    stage: diagnostics.stage,
    staleDeletedFiles: diagnostics.staleDeletedFiles,
    startedAt: timeInNanosToDate(diagnostics.startedAt),
    totalBytes: diagnostics.totalBytes,
    totalFiles: diagnostics.totalFiles,
    updatedAt: timeInNanosToDate(diagnostics.updatedAt),
    uploadedBytes: diagnostics.uploadedBytes,
    uploadedFiles: diagnostics.uploadedFiles,
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
