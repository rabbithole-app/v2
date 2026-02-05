#!/usr/bin/env node

import { readFileSync, writeFileSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ASSETS_DIR = join(__dirname, 'assets');
const RELEASES_JSON = join(__dirname, 'api', 'releases.json');

const ASSETS = ['encrypted-storage.wasm.gz', 'storage-frontend.tar'];

function getFileSize(filename) {
  const filepath = join(ASSETS_DIR, filename);
  if (!existsSync(filepath)) {
    console.warn(`⚠️  File not found: ${filepath}`);
    return null;
  }
  return statSync(filepath).size;
}

function updateReleases() {
  // Get actual file sizes
  const sizes = {};
  for (const asset of ASSETS) {
    const size = getFileSize(asset);
    if (size !== null) {
      sizes[asset] = size;
      console.log(`📦 ${asset}: ${size} bytes`);
    }
  }

  if (Object.keys(sizes).length === 0) {
    console.error('❌ No assets found. Run generate-mock-assets first.');
    process.exit(1);
  }

  // Read and update releases.json
  const releases = JSON.parse(readFileSync(RELEASES_JSON, 'utf-8'));

  let updated = 0;
  for (const release of releases) {
    for (const asset of release.assets) {
      if (sizes[asset.name] !== undefined && asset.size !== sizes[asset.name]) {
        asset.size = sizes[asset.name];
        updated++;
      }
    }
  }

  // Write back
  writeFileSync(RELEASES_JSON, JSON.stringify(releases, null, 2) + '\n');
  console.log(`✅ Updated ${updated} asset size(s) in releases.json`);
}

updateReleases();
