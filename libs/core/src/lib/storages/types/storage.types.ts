/**
 * TypeScript-friendly types converted from Candid types.
 * These types use standard TypeScript optional fields instead of [] | [T] pattern.
 */

import type { Principal } from '@icp-sdk/core/principal';

// ═══════════════════════════════════════════════════════════════
// STORAGE CREATION STATUS TYPES
// ═══════════════════════════════════════════════════════════════

export interface FrontendInstallDiagnostics {
  batchesProcessed: bigint;
  batchesTotal: bigint;
  changedDeletedFiles: bigint;
  completedAt?: Date;
  error?: string;
  processedBytes: bigint;
  processedFiles: bigint;
  skippedBytes: bigint;
  skippedFiles: bigint;
  stage: string;
  staleDeletedFiles: bigint;
  startedAt: Date;
  totalBytes: bigint;
  totalFiles: bigint;
  updatedAt: Date;
  uploadedBytes: bigint;
  uploadedFiles: bigint;
}

/**
 * Sub-phases of `ProcessingPayment`. Backend advances the record through
 * these while running charge → addLicense → activateTrial → queueing deploy.
 */
export type PaymentPhase =
  | { amount: bigint; tokenId: TokenId; type: 'Charging' }
  | { type: 'Activating' }
  | { type: 'CheckingBalances' }
  | { type: 'FetchingRates' }
  | { type: 'Queueing' }
  | { type: 'RecordingLicense' }
  | { type: 'Starting' };

export interface Progress {
  processed: number;
  total: number;
}

export type StorageCreationStatus =
  | { amount: bigint; type: 'TransferringICP'; }
  | { blockIndex: bigint; type: 'NotifyingCMC'; }
  | { canisterId: Principal; progress: Progress; type: 'InstallingWasm'; }
  | { canisterId: Principal; progress: Progress; type: 'ReinstallingWasm'; }
  | { canisterId: Principal; progress: Progress; type: 'UpgradingFrontend'; }
  | { canisterId: Principal; progress: Progress; type: 'UpgradingWasm'; }
  | { canisterId: Principal; progress: Progress; type: 'UploadingFrontend'; }
  | { canisterId: Principal; type: 'CanisterCreated'; }
  | { canisterId: Principal; type: 'Completed'; }
  | { canisterId: Principal; type: 'RevokingInstallerPermission'; }
  | { canisterId: Principal; type: 'UpdatingControllers'; }
  | { message: string; type: 'Failed'; }
  | { phase: PaymentPhase; type: 'ProcessingPayment' }
  | { type: 'CheckingBalance' }
  | { type: 'Pending' };

export type StorageCreationStatusType =
  | 'CanisterCreated'
  | 'CheckingBalance'
  | 'Completed'
  | 'Failed'
  | 'InstallingWasm'
  | 'NotifyingCMC'
  | 'Pending'
  | 'ProcessingPayment'
  | 'ReinstallingWasm'
  | 'RevokingInstallerPermission'
  | 'TransferringICP'
  | 'UpdatingControllers'
  | 'UpgradingFrontend'
  | 'UpgradingWasm'
  | 'UploadingFrontend';

// ═══════════════════════════════════════════════════════════════
// STORAGE RECORD TYPES
// ═══════════════════════════════════════════════════════════════

export type StorageDisplayStatus =
  | 'completed'
  | 'failed'
  | 'in-progress'
  | 'pending';

// ═══════════════════════════════════════════════════════════════
// UPDATE INFO TYPE
// ═══════════════════════════════════════════════════════════════

export interface StorageInfo {
  canisterId?: Principal;
  completedAt?: Date;
  createdAt: Date;
  frontendInstallDiagnostics?: FrontendInstallDiagnostics;
  /** Unique ID of the storage creation process */
  id: bigint;
  /** Last upgrade error message (preserved after revert to Completed) */
  lastUpgradeError?: string;
  releaseTag: string;
  status: StorageCreationStatus;
  updateAvailable?: UpdateInfo;
}

export type TokenId =
  | 'BaseETH'
  | 'BaseUSDC'
  | 'BaseUSDT'
  | 'ckETH'
  | 'ckUSDC'
  | 'ckUSDT'
  | 'ICP'
  | 'SOL'
  | 'SolUSDC'
  | 'SolUSDT';

// ═══════════════════════════════════════════════════════════════
// STORAGE INFO TYPE (matches Candid StorageInfo)
// ═══════════════════════════════════════════════════════════════

export interface UpdateInfo {
  availableReleaseTag?: string;
  availableWasmHash?: Uint8Array;
  currentReleaseTag?: string;
  currentWasmHash?: Uint8Array;
  frontendUpdateAvailable: boolean;
  wasmUpdateAvailable: boolean;
}

export function getStorageDisplayStatus(
  status: StorageCreationStatus,
): StorageDisplayStatus {
  switch (status.type) {
    case 'Completed':
      return 'completed';
    case 'Failed':
      return 'failed';
    case 'Pending':
      return 'pending';
    default:
      return 'in-progress';
  }
}

export function isStorageInProgress(status: StorageCreationStatus): boolean {
  // Terminal states only — `Pending` is a real intermediate step (record
  // queued, orchestrator hasn't picked it up yet) and must stay in-progress
  // so polling continues.
  return status.type !== 'Completed' && status.type !== 'Failed';
}
