#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  BACKEND_DIR,
  DEFAULT_FRONTEND_DIR,
  DEFAULT_MOCK_ROOT,
  DEFAULT_WASM_PATH,
  REPO_ROOT,
  assertRequiredAssets,
  bumpStorageVersion,
  buildMockReleaseEntry,
  copyIfExists,
  ensureDir,
  latestRelease,
  mergeRelease,
  normalizeStorageTag,
  parseArgs,
  readJson,
  releaseApiPath,
  releaseDir,
  removePath,
  versionFromTag,
  writeJson,
} from './mock-storage-release-utils.mjs';

const DEFAULT_BASELINE_VERSION = '0.1.0';

function parseBool(value, fallback) {
  if (value === undefined) return fallback;
  if (value === true) return true;
  return ['1', 'true', 'yes'].includes(String(value).toLowerCase());
}

function resolveMockRoot(args) {
  return resolve(args['mock-root'] ?? DEFAULT_MOCK_ROOT);
}

function resolveFrontendDir(args) {
  return resolve(args['frontend-dir'] ?? DEFAULT_FRONTEND_DIR);
}

function resolveWasmPath(args) {
  return resolve(args['wasm-path'] ?? DEFAULT_WASM_PATH);
}

function inferReleaseIdentity(args, baselineReleases) {
  if (args.tag) {
    const tagName = normalizeStorageTag(args.tag);
    return { tagName, version: versionFromTag(tagName) };
  }

  if (args.version) {
    const version = versionFromTag(args.version);
    return { tagName: normalizeStorageTag(version), version };
  }

  if (args.mode === 'baseline') {
    return {
      tagName: normalizeStorageTag(DEFAULT_BASELINE_VERSION),
      version: DEFAULT_BASELINE_VERSION,
    };
  }

  const baseline = latestRelease(baselineReleases);
  const baseVersion = baseline ? versionFromTag(baseline.tag_name) : DEFAULT_BASELINE_VERSION;
  const bump = String(args.bump ?? 'patch');
  const version = `${bumpStorageVersion(baseVersion, bump)}-dev`;
  return { tagName: normalizeStorageTag(version), version };
}

function copyReleaseInputs(args, releaseDirPath) {
  const didPath = args['did-path'] ? resolve(args['did-path']) : null;
  const stableSignaturePath = args['stable-signature-path'] ? resolve(args['stable-signature-path']) : null;
  const hasExplicitArtifacts = args['wasm-path'] || didPath || stableSignaturePath;

  if (hasExplicitArtifacts && (!args['wasm-path'] || !didPath || !stableSignaturePath)) {
    throw new Error('Pass --wasm-path, --did-path, and --stable-signature-path together, or omit all three to build artifacts.');
  }

  if (!hasExplicitArtifacts) {
    execFileSync(join(BACKEND_DIR, 'scripts/build-storage-release-wasm.sh'), [
      '--artifacts-dir',
      releaseDirPath,
    ], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
    return;
  }

  const wasmPath = resolveWasmPath(args);
  if (!existsSync(wasmPath)) {
    throw new Error(`Storage WASM not found: ${wasmPath}`);
  }

  copyFileSync(wasmPath, join(releaseDirPath, 'encrypted-storage.wasm.gz'));
  copyIfExists(didPath, join(releaseDirPath, 'encrypted-storage.did'));
  copyIfExists(stableSignaturePath, join(releaseDirPath, 'encrypted-storage.most'));
}

function createFrontendArchive(frontendDir, releaseDirPath) {
  if (!existsSync(frontendDir)) {
    throw new Error(`Storage frontend build not found: ${frontendDir}`);
  }
  if (!readdirSync(frontendDir).some((name) => name === 'index.html')) {
    throw new Error(`Storage frontend build looks empty (no index.html): ${frontendDir}. Run \`npx nx build storage\` first.`);
  }

  execFileSync('tar', ['-cf', join(releaseDirPath, 'storage-frontend.tar'), '-C', frontendDir, '.'], {
    cwd: REPO_ROOT,
    env: { ...process.env, COPYFILE_DISABLE: '1' },
    stdio: 'inherit',
  });
}

function buildManifest(args, releaseDirPath, frontendDir, version) {
  // Default to signature-based inference over mock/assets (see
  // --stable-signature-history-dir below) so the release is installable from
  // every locally known release whose .most is stable-compatible — not just
  // the committed baseline. Local-only releases like a regenerated
  // storage-v0.2.0 live in releases.local.json, not in the baseline index.
  const compatibleFrom = args['compatible-from'] ?? '';
  const command = [
    join(BACKEND_DIR, 'scripts/build-storage-release-manifest.mjs'),
    '--version',
    version,
    '--artifacts-dir',
    releaseDirPath,
    '--frontend-dir',
    frontendDir,
    '--output',
    join(releaseDirPath, 'storage-release.json'),
    '--release-body',
    join(releaseDirPath, 'storage-release.md'),
    '--max-commits',
    String(args['max-commits'] ?? 50),
  ];

  if (compatibleFrom) {
    command.push('--compatible-from', compatibleFrom);
  } else {
    command.push('--stable-signature-history-dir', join(resolveMockRoot(args), 'assets'));
  }
  if (args['release-notes']) {
    command.push('--release-notes', resolve(args['release-notes']));
  }

  execFileSync(process.execPath, command, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
}

function nextReleaseId(releases) {
  return releases.reduce((max, release) => Math.max(max, Number(release.id ?? 0)), 0) + 1;
}

function defaultReleaseName(tagName) {
  return `Storage v${versionFromTag(tagName)}`;
}

function writeReleaseIndex(args, mockRoot, release, baselineReleases) {
  if (args.mode === 'baseline') {
    writeJson(releaseApiPath(mockRoot), [release]);
    return releaseApiPath(mockRoot);
  }

  const localPath = releaseApiPath(mockRoot, true);
  const localReleases = readJson(localPath, baselineReleases);
  const keepPreviousDev = parseBool(args['keep-previous-dev'], false);
  const base = keepPreviousDev
    ? localReleases
    : baselineReleases;

  writeJson(localPath, mergeRelease(base, release));
  return localPath;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  args.mode = args.mode ?? 'dev';
  if (!['baseline', 'dev'].includes(args.mode)) {
    throw new Error(`Unsupported mode: ${args.mode}`);
  }

  const mockRoot = resolveMockRoot(args);
  const frontendDir = resolveFrontendDir(args);
  const baselinePath = releaseApiPath(mockRoot);
  const baselineReleases = readJson(baselinePath, []);
  const { tagName, version } = inferReleaseIdentity(args, baselineReleases);
  const releaseDirPath = releaseDir(mockRoot, tagName);
  const createdAt = args['created-at'] ?? new Date().toISOString();

  ensureDir(releaseDirPath);
  copyReleaseInputs(args, releaseDirPath);
  createFrontendArchive(frontendDir, releaseDirPath);
  buildManifest(args, releaseDirPath, frontendDir, version);
  assertRequiredAssets(releaseDirPath);

  const releaseBodyPath = join(releaseDirPath, 'storage-release.md');
  const body = existsSync(releaseBodyPath)
    ? readFileSync(releaseBodyPath, 'utf8')
    : `Local mock release ${tagName}`;
  removePath(releaseBodyPath);

  const release = buildMockReleaseEntry({
    body,
    createdAt,
    draft: parseBool(args.draft, false),
    id: Number(args.id ?? nextReleaseId(baselineReleases)),
    name: args.name ?? defaultReleaseName(tagName),
    prerelease: parseBool(args.prerelease, args.mode !== 'baseline'),
    releaseDirPath,
    tagName,
  });

  const indexPath = writeReleaseIndex(args, mockRoot, release, baselineReleases);

  console.log(`Wrote ${tagName} to ${releaseDirPath}`);
  console.log(`Updated ${indexPath}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
