#!/usr/bin/env node
// Replace the pocket-ic binary bundled with @dfinity/pic with the one from a
// specific dfinity/ic release, so tests run against a PocketIC that supports
// the features our Motoko backend depends on (caller info, environment vars).
//
// Runs as a postinstall in apps/backend, AFTER @dfinity/pic's own postinstall.
// Idempotent via a version-stamp file next to the binary.

import { createWriteStream, promises as fs } from 'node:fs';
import https from 'node:https';
import { dirname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = resolve(__dirname, '..');

// Pin the exact IC release required by the test runtime. We intentionally use
// a dfinity/ic artifact, not the @dfinity/pic bundled pocket-ic, because the
// backend depends on replica/runtime features that are newer than pic-js 0.21.0.
const IC_RELEASE = 'release-2026-04-24_04-21-dirty-accessed-charging';

const IS_LINUX = process.platform === 'linux';
const IS_ARM = process.arch === 'arm64';
const PLATFORM = `${IS_ARM ? 'arm64' : 'x86_64'}-${IS_LINUX ? 'linux' : 'darwin'}`;
const ASSET = `pocket-ic-${PLATFORM}.gz`;
const URL = `https://github.com/dfinity/ic/releases/download/${IC_RELEASE}/${ASSET}`;

const TARGET = resolve(BACKEND_DIR, 'node_modules/@dfinity/pic/pocket-ic');
const STAMP = `${TARGET}.override-stamp`;

async function downloadAndGunzip(url, dest) {
  const follow = (u) => new Promise((resolvePromise, rejectPromise) => {
    https.get(u, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        follow(res.headers.location).then(resolvePromise, rejectPromise);
        return;
      }
      if (res.statusCode !== 200) {
        rejectPromise(new Error(`HTTP ${res.statusCode} fetching ${u}`));
        return;
      }
      resolvePromise(res);
    }).on('error', rejectPromise);
  });

  const stream = await follow(url);
  await pipeline(stream, createGunzip(), createWriteStream(dest));
}

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function main() {
  if (!(await fileExists(dirname(TARGET)))) {
    console.log('[override-pocketic] @dfinity/pic not installed, skipping');
    return;
  }

  // Already overridden for this release?
  if (await fileExists(STAMP)) {
    const stamped = (await fs.readFile(STAMP, 'utf8')).trim();
    if (stamped === IC_RELEASE) {
      console.log(`[override-pocketic] already at ${IC_RELEASE}, skipping`);
      return;
    }
  }

  console.log(`[override-pocketic] downloading ${ASSET} from ${IC_RELEASE}...`);
  await downloadAndGunzip(URL, TARGET);
  await fs.chmod(TARGET, 0o755);
  await fs.writeFile(STAMP, IC_RELEASE, 'utf8');
  console.log(`[override-pocketic] installed at ${TARGET}`);
}

main().catch(err => {
  console.error('[override-pocketic] FAILED:', err.message);
  process.exit(1);
});
