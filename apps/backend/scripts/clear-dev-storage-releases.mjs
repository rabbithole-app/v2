#!/usr/bin/env node

import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  DEFAULT_MOCK_ROOT,
  parseArgs,
  releaseApiPath,
  releaseAssetsRoot,
  removePath,
} from './mock-storage-release-utils.mjs';

function isDevStorageReleaseDir(name) {
  return /^storage-v\d+\.\d+\.\d+-dev(?:\.|$)/.test(name);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mockRoot = resolve(args['mock-root'] ?? DEFAULT_MOCK_ROOT);
  const localApiPath = releaseApiPath(mockRoot, true);
  const assetsRoot = releaseAssetsRoot(mockRoot);
  const removed = [];

  if (existsSync(localApiPath)) {
    removePath(localApiPath);
    removed.push(localApiPath);
  }

  if (existsSync(assetsRoot)) {
    for (const entry of readdirSync(assetsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || !isDevStorageReleaseDir(entry.name)) continue;
      const path = join(assetsRoot, entry.name);
      removePath(path);
      removed.push(path);
    }
  }

  if (removed.length === 0) {
    console.log('No local dev storage releases found.');
    return;
  }

  for (const path of removed) {
    console.log(`Removed ${path}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
