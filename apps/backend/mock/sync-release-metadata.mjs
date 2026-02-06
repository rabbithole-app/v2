#!/usr/bin/env node

import { createHash } from 'crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, join  } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ASSETS_DIR = join(__dirname, 'assets');
const RELEASES_JSON = join(__dirname, 'api', 'releases.json');

const ASSETS = ['encrypted-storage.wasm.gz', 'storage-frontend.tar'];

function getFileMetadata(filename) {
  const filepath = join(ASSETS_DIR, filename);
  if (!existsSync(filepath)) {
    console.warn(`⚠️  File not found: ${filepath}`);
    return null;
  }

  const content = readFileSync(filepath);
  const size = statSync(filepath).size;
  const hash = createHash('sha256').update(content).digest('hex');
  const digest = `sha256:${hash}`;

  return { size, digest };
}

function syncReleaseMetadata() {
  // Get actual file metadata (size + digest)
  const metadata = {};
  for (const asset of ASSETS) {
    const meta = getFileMetadata(asset);
    if (meta !== null) {
      metadata[asset] = meta;
      console.log(`📦 ${asset}:`);
      console.log(`   size: ${meta.size} bytes`);
      console.log(`   digest: ${meta.digest}`);
    }
  }

  if (Object.keys(metadata).length === 0) {
    console.error('❌ No assets found. Run generate-mock-assets first.');
    process.exit(1);
  }

  // Read and update releases.json
  const releases = JSON.parse(readFileSync(RELEASES_JSON, 'utf-8'));

  let updatedSizes = 0;
  let updatedDigests = 0;

  for (const release of releases) {
    for (const asset of release.assets) {
      const meta = metadata[asset.name];
      if (!meta) continue;

      if (asset.size !== meta.size) {
        asset.size = meta.size;
        updatedSizes++;
      }

      if (asset.digest !== meta.digest) {
        asset.digest = meta.digest;
        updatedDigests++;
      }
    }
  }

  // Write back
  writeFileSync(RELEASES_JSON, JSON.stringify(releases, null, 2) + '\n');
  console.log(`\n✅ Updated ${updatedSizes} size(s) and ${updatedDigests} digest(s) in releases.json`);
}

syncReleaseMetadata();
