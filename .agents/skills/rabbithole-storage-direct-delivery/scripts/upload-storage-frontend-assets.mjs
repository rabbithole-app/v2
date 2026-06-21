#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash, createPrivateKey } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = parseArgs(process.argv.slice(2));
const repoRoot = args.repoRoot ?? process.env.REPO_ROOT ?? process.cwd();
const distDir =
  args.distDir ??
  process.env.DIST_DIR ??
  join(repoRoot, 'dist/apps/storage/browser');
const canisterId = args.canister ?? process.env.CANISTER_ID;
const identityName = args.identity ?? process.env.IDENTITY;
const host = args.host ?? process.env.HOST ?? 'https://icp-api.io';
const chunkSize = Number.parseInt(
  args.chunkSize ?? process.env.CHUNK_SIZE ?? '1800000',
  10,
);
const commit = process.env.COMMIT === '1' || args.commit === '1';

if (!canisterId) {
  console.error(
    'Missing target canister. Pass --canister <canister-id> or CANISTER_ID=<canister-id>.',
  );
  process.exit(2);
}

if (!identityName) {
  console.error(
    'Missing identity. Pass --identity <identity-name> or IDENTITY=<identity-name>.',
  );
  process.exit(2);
}

const require = createRequire(join(repoRoot, 'package.json'));
const { Actor, HttpAgent } = require('@icp-sdk/core/agent');
const { Principal } = require('@icp-sdk/core/principal');
const { Secp256k1KeyIdentity } = require('@icp-sdk/core/identity/secp256k1');

const CONTENT_TYPES = new Map([
  ['.br', 'application/brotli'],
  ['.css', 'text/css'],
  ['.gif', 'image/gif'],
  ['.gz', 'application/gzip'],
  ['.html', 'text/html'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript'],
  ['.json', 'application/json'],
  ['.json5', 'application/json'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain'],
  ['.wasm', 'application/wasm'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--canister') result.canister = argv[++index];
    else if (arg === '--identity') result.identity = argv[++index];
    else if (arg === '--host') result.host = argv[++index];
    else if (arg === '--repo-root') result.repoRoot = argv[++index];
    else if (arg === '--dist-dir') result.distDir = argv[++index];
    else if (arg === '--chunk-size') result.chunkSize = argv[++index];
    else if (arg === '--commit') result.commit = '1';
    else if (arg === '--help') {
      console.log(
        'Usage: upload-storage-frontend-assets.mjs --canister <id> --identity <name> [--commit]',
      );
      console.log(
        'Set COMMIT=1 or pass --commit to mutate the canister. Without it, the script is a signed dry-run diff.',
      );
      process.exit(0);
    }
  }
  return result;
}

function b64urlToBytes(value) {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function loadIdentity() {
  const pem = execFileSync('icp', ['identity', 'export', identityName], {
    encoding: 'utf8',
  });
  const jwk = createPrivateKey(pem).export({ format: 'jwk' });
  const identity = Secp256k1KeyIdentity.fromSecretKey(
    new Uint8Array(b64urlToBytes(jwk.d)),
  );
  assertExportedPrincipalMatchesCli(identity);
  return identity;
}

function assertExportedPrincipalMatchesCli(identity) {
  const cliPrincipal = execFileSync(
    'icp',
    ['identity', 'principal', '--identity', identityName],
    { encoding: 'utf8' },
  ).trim();
  const exportedPrincipal = identity.getPrincipal().toText();
  if (cliPrincipal !== exportedPrincipal) {
    throw new Error(
      [
        `Exported identity principal (${exportedPrincipal}) does not match icp-cli principal (${cliPrincipal}).`,
        'This usually means the selected identity uses a delegation that this Node helper cannot preserve.',
        'Do not write assets with this helper; use an icp-cli-native upload path or the app frontend upload drawer.',
      ].join(' '),
    );
  }
}

async function loadActor() {
  const { idlFactory } = await import(
    pathToFileURL(
      join(
        repoRoot,
        'dist/libs/declarations/esm/encrypted-storage/encrypted-storage.did.js',
      ),
    ).href
  );
  const identity = loadIdentity();
  const agent = new HttpAgent({ host, identity });
  return Actor.createActor(idlFactory, {
    agent,
    canisterId: Principal.fromText(canisterId),
  });
}

function fileKey(path) {
  return `/${relative(distDir, path).split(sep).join('/')}`;
}

function listFiles(dir = distDir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.name.startsWith('._')) return [];
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

function contentTypeFor(key) {
  return CONTENT_TYPES.get(extname(key)) ?? 'application/octet-stream';
}

function sha256(bytes) {
  return new Uint8Array(createHash('sha256').update(bytes).digest());
}

function sha256Hex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

function contentEncodingFor(key) {
  if (key.endsWith('.gz')) return 'gzip';
  if (key.endsWith('.br')) return 'br';
  return 'identity';
}

function shouldPreserveRemoteOnlyAsset(key) {
  return key === '/info.json' || key.startsWith('/static/thumbnails/');
}

function localAsset(path) {
  const content = readFileSync(path);
  const key = fileKey(path);
  const hash = sha256(content);
  return {
    key,
    content,
    contentType: contentTypeFor(key),
    contentEncoding: contentEncodingFor(key),
    hash,
    hashHex: sha256Hex(hash),
    size: statSync(path).size,
  };
}

function existingEncodingHash(asset, encodingName) {
  if (!asset) return null;
  const encoding = asset.encodings.find(
    (item) => item.content_encoding === encodingName,
  );
  const hash = encoding?.sha256?.[0];
  return hash ? sha256Hex(hash) : null;
}

async function uploadChunks(actor, batchId, content) {
  const chunkIds = [];
  for (let offset = 0; offset < content.byteLength; offset += chunkSize) {
    const chunk = content.subarray(
      offset,
      Math.min(offset + chunkSize, content.byteLength),
    );
    const { chunk_id } = await actor.create_chunk({
      batch_id: batchId,
      content: chunk,
    });
    chunkIds.push(chunk_id);
  }
  return chunkIds;
}

function createAssetOperations(asset, chunkIds) {
  return [
    {
      CreateAsset: {
        key: asset.key,
        content_type: asset.contentType,
        headers: [[]],
        allow_raw_access: [false],
        max_age: [],
        enable_aliasing: [asset.key.endsWith('index.html')],
      },
    },
    {
      SetAssetContent: {
        key: asset.key,
        sha256: [asset.hash],
        chunk_ids: chunkIds,
        content_encoding: asset.contentEncoding,
      },
    },
  ];
}

const actor = await loadActor();
const localAssets = listFiles()
  .map(localAsset)
  .sort((a, b) => a.key.localeCompare(b.key));
const localByKey = new Map(localAssets.map((asset) => [asset.key, asset]));
const existingAssets = await actor.list({});
const existingByKey = new Map(
  existingAssets.map((asset) => [asset.key, asset]),
);
const changedAssets = localAssets.filter(
  (asset) =>
    existingEncodingHash(
      existingByKey.get(asset.key),
      asset.contentEncoding,
    ) !== asset.hashHex,
);
const staleAssets = existingAssets
  .filter(
    (asset) =>
      !localByKey.has(asset.key) && !shouldPreserveRemoteOnlyAsset(asset.key),
  )
  .sort((a, b) => a.key.localeCompare(b.key));

const changedExistingAssets = changedAssets.filter((asset) =>
  existingByKey.has(asset.key),
);
const newAssets = changedAssets.filter(
  (asset) => !existingByKey.has(asset.key),
);
const unchanged = localAssets.length - changedAssets.length;
const changedBytes = changedAssets.reduce((sum, asset) => sum + asset.size, 0);

console.log(
  JSON.stringify(
    {
      canisterId,
      identity: identityName,
      commit,
      files: localAssets.length,
      existingAssets: existingAssets.length,
      changed: changedAssets.length,
      changedExisting: changedExistingAssets.length,
      newAssets: newAssets.length,
      unchanged,
      stale: staleAssets.length,
      changedBytes,
      preserveInfoJson:
        existingByKey.has('/info.json') &&
        !staleAssets.some((asset) => asset.key === '/info.json'),
    },
    null,
    2,
  ),
);

if (!commit) {
  process.exit(0);
}

if (changedAssets.length === 0 && staleAssets.length === 0) {
  console.log('No asset changes to commit.');
  process.exit(0);
}

let uploadedBytes = 0;
let operations = [];
let createBatchId = null;

try {
  if (changedExistingAssets.length > 0) {
    const { batch_id: updateBatchId } = await actor.create_batch({});
    try {
      for (const asset of changedExistingAssets) {
        const chunkIds = await uploadChunks(
          actor,
          updateBatchId,
          asset.content,
        );
        await actor.set_asset_content({
          key: asset.key,
          sha256: [asset.hash],
          chunk_ids: chunkIds,
          content_encoding: asset.contentEncoding,
        });
        uploadedBytes += asset.content.byteLength;
      }
    } finally {
      await actor.delete_batch({ batch_id: updateBatchId }).catch(() => {});
    }
  }

  if (newAssets.length > 0) {
    const res = await actor.create_batch({});
    createBatchId = res.batch_id;
    for (const asset of newAssets) {
      const chunkIds = await uploadChunks(actor, createBatchId, asset.content);
      uploadedBytes += asset.content.byteLength;
      operations.push(...createAssetOperations(asset, chunkIds));
    }

    await actor.commit_batch({
      batch_id: createBatchId,
      operations,
    });
    createBatchId = null;
  }

  for (const { key } of staleAssets) {
    await actor.delete_asset({ key });
  }
} catch (error) {
  if (createBatchId !== null) {
    await actor.delete_batch({ batch_id: createBatchId }).catch(() => {});
  }
  throw error;
}

console.log(
  JSON.stringify(
    {
      committed: true,
      updatedExisting: changedExistingAssets.length,
      newAssets: newAssets.length,
      operations: operations.length,
      uploadedBytes,
      deleted: staleAssets.length,
    },
    null,
    2,
  ),
);
