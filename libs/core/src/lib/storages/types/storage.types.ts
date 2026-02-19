/**
 * TypeScript-friendly types converted from Candid types.
 * These types use standard TypeScript optional fields instead of [] | [T] pattern.
 */

import type { Principal } from '@icp-sdk/core/principal';

// ═══════════════════════════════════════════════════════════════
// STORAGE CREATION STATUS TYPES
// ═══════════════════════════════════════════════════════════════

export interface Progress {
  processed: number;
  total: number;
}

export type StorageCreationStatus =
  | { amount: bigint; type: 'TransferringICP'; }
  | { blockIndex: bigint; type: 'NotifyingCMC'; }
  | { canisterId: Principal; progress: Progress; type: 'InstallingWasm'; }
  | { canisterId: Principal; progress: Progress; type: 'UpgradingFrontend'; }
  | { canisterId: Principal; progress: Progress; type: 'UpgradingWasm'; }
  | { canisterId: Principal; progress: Progress; type: 'UploadingFrontend'; }
  | { canisterId: Principal; type: 'CanisterCreated'; }
  | { canisterId: Principal; type: 'Completed'; }
  | { canisterId: Principal; type: 'RevokingInstallerPermission'; }
  | { canisterId: Principal; type: 'UpdatingControllers'; }
  | { message: string; type: 'Failed'; }
  | { type: 'CheckingAllowance' }
  | { type: 'Pending' };

export type StorageCreationStatusType =
  | 'CanisterCreated'
  | 'CheckingAllowance'
  | 'Completed'
  | 'Failed'
  | 'InstallingWasm'
  | 'NotifyingCMC'
  | 'Pending'
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
  /** Unique ID of the storage creation process */
  id: bigint;
  releaseTag: string;
  status: StorageCreationStatus;
  updateAvailable?: UpdateInfo;
}

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
  return !['Completed', 'Failed', 'Pending'].includes(status.type);
}
