/**
 * TypeScript-friendly types converted from Candid types.
 * These types use standard TypeScript optional fields instead of [] | [T] pattern.
 */

// ═══════════════════════════════════════════════════════════════
// FILE METADATA TYPES
// ═══════════════════════════════════════════════════════════════

export interface Asset {
  contentType: string;
  downloadStatus: AssetDownloadStatus;
  extractionStatus?: AssetExtractionStatus;
  name: string;
  size: number;
}

// ═══════════════════════════════════════════════════════════════
// ASSET TYPES
// ═══════════════════════════════════════════════════════════════

export type AssetDownloadStatus =
  | { chunksCompleted: number; chunksError: number; chunksTotal: number; type: 'Downloading' }
  | { message: string; type: 'Error' }
  | { size: number; type: 'Completed' }
  | { type: 'NotStarted' };

export type AssetExtractionStatus =
  | { files: FileMetadata[]; type: 'Complete' }
  | { processed: number; total: number; type: 'Decoding' }
  | { type: 'Idle' };

export interface FileMetadata {
  contentType: string;
  key: string;
  sha256: Uint8Array;
  size: number;
}

// ═══════════════════════════════════════════════════════════════
// RELEASE TYPES
// ═══════════════════════════════════════════════════════════════

export interface Release {
  assets: Asset[];
  createdAt: Date;
  draft: boolean;
  isDeploymentReady: boolean;
  isDownloaded: boolean;
  name: string;
  prerelease: boolean;
  publishedAt?: Date;
  /** Computed status */
  status: ReleaseStatus;
  tagName: string;
  /** Computed release type */
  type: ReleaseType;
}

export interface ReleasesStatus {
  completedDownloads: number;
  defaultVersionKey: string;
  hasDeploymentReadyRelease: boolean;
  hasDownloadedRelease: boolean;
  pendingDownloads: number;
  releases: Release[];
  releasesCount: number;
}

export type ReleaseStatus =
  | 'downloading'
  | 'error'
  | 'extracting'
  | 'pending'
  | 'ready'
  | 'unknown';

// ═══════════════════════════════════════════════════════════════
// RELEASES STATUS TYPES
// ═══════════════════════════════════════════════════════════════

export type ReleaseType = 'draft' | 'prerelease' | 'stable';
