import { fromNullable } from '@dfinity/utils';
import { match, P } from 'ts-pattern';

import { timeInNanosToDate } from '@rabbithole/core';
import type {
  AssetFullStatus,
  ExtractionStatus,
  ReleaseFullStatus,
  ReleasesFullStatus,
} from '@rabbithole/declarations';

import type {
  Asset,
  AssetDownloadStatus,
  AssetExtractionStatus,
  FileMetadata,
  Release,
  ReleasesStatus,
  ReleaseStatus,
  ReleaseType,
} from '../types';

/**
 * Convert Candid AssetFullStatus to TypeScript-friendly Asset
 */
export function convertAssetFullStatus(assetStatus: AssetFullStatus): Asset {
  return {
    contentType: assetStatus.contentType,
    downloadStatus: convertDownloadStatus(assetStatus.downloadStatus),
    extractionStatus: convertExtractionStatus(assetStatus.extractionStatus),
    name: assetStatus.name,
    size: Number(assetStatus.size),
  };
}

/**
 * Convert Candid ReleaseFullStatus to TypeScript-friendly Release
 */
export function convertReleaseFullStatus(status: ReleaseFullStatus): Release {
  const assets = status.assets.map(convertAssetFullStatus);
  const publishedAt = fromNullable(status.publishedAt);

  return {
    assets,
    createdAt: timeInNanosToDate(status.createdAt),
    draft: status.draft,
    isDeploymentReady: status.isDeploymentReady,
    isDownloaded: status.isDownloaded,
    name: status.name,
    prerelease: status.prerelease,
    publishedAt: publishedAt ? timeInNanosToDate(publishedAt) : undefined,
    status: computeReleaseStatus(status),
    tagName: status.tagName,
    type: computeReleaseType(status),
  };
}

/**
 * Convert Candid ReleasesFullStatus to TypeScript-friendly ReleasesStatus
 */
export function convertReleasesFullStatus(
  status: ReleasesFullStatus,
): ReleasesStatus {
  return {
    completedDownloads: Number(status.completedDownloads),
    defaultVersionKey: status.defaultVersionKey,
    hasDeploymentReadyRelease: status.hasDeploymentReadyRelease,
    hasDownloadedRelease: status.hasDownloadedRelease,
    pendingDownloads: Number(status.pendingDownloads),
    releases: status.releases.map(convertReleaseFullStatus),
    releasesCount: Number(status.releasesCount),
  };
}

/**
 * Compute release status from candid data
 */
function computeReleaseStatus(status: ReleaseFullStatus): ReleaseStatus {
  if (status.isDeploymentReady) {
    return 'ready';
  }

  const hasDownloading = status.assets.some(
    (a) => 'Downloading' in a.downloadStatus,
  );
  if (hasDownloading) {
    return 'downloading';
  }

  const hasExtracting = status.assets.some((a) => {
    const value = fromNullable(a.extractionStatus);
    return value && 'Decoding' in value;
  });
  if (hasExtracting) {
    return 'extracting';
  }

  const hasError = status.assets.some((a) => 'Error' in a.downloadStatus);
  if (hasError) {
    return 'error';
  }

  const hasNotStarted = status.assets.some(
    (a) => 'NotStarted' in a.downloadStatus,
  );
  if (hasNotStarted) {
    return 'pending';
  }

  return 'unknown';
}

/**
 * Compute release type from candid data
 */
function computeReleaseType(status: ReleaseFullStatus): ReleaseType {
  if (status.draft) {
    return 'draft';
  }
  if (status.prerelease) {
    return 'prerelease';
  }
  return 'stable';
}

/**
 * Convert Candid AssetDownloadStatus to TypeScript-friendly version
 */
function convertDownloadStatus(
  assetStatus: AssetFullStatus['downloadStatus'],
): AssetDownloadStatus {
  return match(assetStatus)
    .returnType<AssetDownloadStatus>()
    .with(
      { Downloading: P.select() },
      ({ chunksCompleted, chunksError, chunksTotal }) => ({
        chunksCompleted: Number(chunksCompleted),
        chunksError: Number(chunksError),
        chunksTotal: Number(chunksTotal),
        type: 'Downloading',
      }),
    )
    .with({ Completed: P.select() }, ({ size }) => ({
      size: Number(size),
      type: 'Completed',
    }))
    .with({ Error: P.select() }, (message) => ({
      message,
      type: 'Error',
    }))
    .otherwise(() => ({ type: 'NotStarted' }));
}

/**
 * Convert Candid ExtractionStatus to TypeScript-friendly version
 */
function convertExtractionStatus(
  candid: [] | [ExtractionStatus],
): AssetExtractionStatus | undefined {
  const status = fromNullable(candid);
  if (!status) {
    return undefined;
  }

  return match(status)
    .returnType<AssetExtractionStatus>()
    .with({ Decoding: P.select() }, ({ processed, total }) => ({
      processed: Number(processed),
      total: Number(total),
      type: 'Decoding',
    }))
    .with({ Complete: P.select() }, (files) => ({
      files: files.map(convertFileMetadata),
      type: 'Complete',
    }))
    .otherwise(() => ({ type: 'Idle' }));
}

/**
 * Convert Candid FileMetadata to TypeScript-friendly version
 */
function convertFileMetadata(
  candid: Parameters<typeof convertExtractionStatus>[0] extends [] | [infer T]
    ? T extends { Complete: infer C }
      ? C extends Array<infer F>
        ? F
        : never
      : never
    : never,
): FileMetadata {
  return {
    contentType: candid.contentType,
    key: candid.key,
    sha256: new Uint8Array(candid.sha256),
    size: Number(candid.size),
  };
}
