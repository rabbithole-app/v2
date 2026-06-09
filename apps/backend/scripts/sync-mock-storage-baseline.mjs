#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  CONTENT_TYPES,
  DEFAULT_MOCK_ROOT,
  REQUIRED_STORAGE_ASSETS,
  assertRequiredAssets,
  buildMockReleaseEntry,
  ensureDir,
  normalizeStorageTag,
  parseArgs,
  releaseApiPath,
  releaseDir,
  sha256Buffer,
  sha256File,
  writeJson,
} from './mock-storage-release-utils.mjs';

const DEFAULT_OWNER = 'rabbithole-app';
const DEFAULT_REPO = 'v2';
const DEFAULT_API_URL = 'https://api.github.com';

function headers(token) {
  const result = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'rabbithole-storage-release-sync',
  };
  if (token) result.Authorization = `Bearer ${token}`;
  return result;
}

async function fetchJson(url, token) {
  const response = await fetch(url, { headers: headers(token) });
  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status} for ${url}`);
  }
  return response.json();
}

async function downloadAsset(asset, targetPath, token) {
  const url = asset.browser_download_url ?? asset.url;
  const response = await fetch(url, {
    headers: asset.browser_download_url
      ? headers(token)
      : { ...headers(token), Accept: 'application/octet-stream' },
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${asset.name}: ${response.status}`);
  }

  const body = Buffer.from(await response.arrayBuffer());
  const expectedDigest = typeof asset.digest === 'string' && asset.digest.startsWith('sha256:')
    ? asset.digest.slice('sha256:'.length)
    : null;
  const actualDigest = sha256Buffer(body);

  if (expectedDigest && expectedDigest !== actualDigest) {
    throw new Error(`Digest mismatch for ${asset.name}: expected ${expectedDigest}, got ${actualDigest}`);
  }

  writeFileSync(targetPath, body);
}

function releaseAssetByName(release, name) {
  return release.assets.find((asset) => asset.name === name);
}

function validateManifestArtifacts(releaseDirPath) {
  const manifestPath = join(releaseDirPath, 'storage-release.json');
  if (!existsSync(manifestPath)) return;

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const artifacts = manifest.artifacts ?? {};

  for (const [kind, artifact] of Object.entries(artifacts)) {
    if (!artifact?.name || !artifact?.sha256) continue;
    const artifactPath = join(releaseDirPath, artifact.name);
    if (!existsSync(artifactPath)) {
      throw new Error(`Manifest ${kind} artifact is missing: ${artifact.name}`);
    }

    const actual = sha256File(artifactPath);
    if (actual !== artifact.sha256) {
      throw new Error(`Manifest hash mismatch for ${artifact.name}: expected ${artifact.sha256}, got ${actual}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.tag) {
    throw new Error('Pass --tag storage-vX.Y.Z to sync a concrete GitHub release.');
  }

  const tagName = normalizeStorageTag(args.tag);
  const owner = args.owner ?? process.env.GITHUB_OWNER ?? DEFAULT_OWNER;
  const repo = args.repo ?? process.env.GITHUB_REPO ?? DEFAULT_REPO;
  const apiUrl = String(args['api-url'] ?? process.env.GITHUB_API_URL ?? DEFAULT_API_URL).replace(/\/$/, '');
  const token = args.token ?? process.env.GITHUB_TOKEN;
  const mockRoot = resolve(args['mock-root'] ?? DEFAULT_MOCK_ROOT);
  const releaseDirPath = releaseDir(mockRoot, tagName);

  const release = await fetchJson(`${apiUrl}/repos/${owner}/${repo}/releases/tags/${tagName}`, token);
  ensureDir(releaseDirPath);

  for (const name of REQUIRED_STORAGE_ASSETS) {
    const asset = releaseAssetByName(release, name);
    if (!asset) {
      throw new Error(`Release ${tagName} is missing required asset ${name}`);
    }
    await downloadAsset(asset, join(releaseDirPath, name), token);
  }

  assertRequiredAssets(releaseDirPath);
  validateManifestArtifacts(releaseDirPath);

  const localRelease = buildMockReleaseEntry({
    body: release.body ?? '',
    createdAt: release.published_at ?? release.created_at ?? new Date().toISOString(),
    draft: args['preserve-kind'] ? Boolean(release.draft) : false,
    id: Number(release.id ?? 1),
    name: release.name ?? `Storage ${tagName}`,
    prerelease: args['preserve-kind'] ? Boolean(release.prerelease) : false,
    releaseDirPath,
    tagName,
  });

  for (const asset of localRelease.assets) {
    asset.content_type = CONTENT_TYPES[asset.name] ?? asset.content_type;
  }

  writeJson(releaseApiPath(mockRoot), [localRelease]);
  console.log(`Synced ${tagName} into ${releaseDirPath}`);
  console.log(`Updated ${releaseApiPath(mockRoot)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
