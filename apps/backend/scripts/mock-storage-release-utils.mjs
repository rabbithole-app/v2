import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const __dirname = dirname(fileURLToPath(import.meta.url));
export const BACKEND_DIR = resolve(__dirname, '..');
export const REPO_ROOT = resolve(BACKEND_DIR, '..', '..');
export const DEFAULT_MOCK_ROOT = resolve(BACKEND_DIR, 'mock');
export const DEFAULT_FRONTEND_DIR = resolve(REPO_ROOT, 'dist/apps/storage/browser');
export const DEFAULT_WASM_PATH = resolve(BACKEND_DIR, '.icp/cache/artifacts/encrypted-storage');

export const STORAGE_TAG_PREFIX = 'storage-v';

export const REQUIRED_STORAGE_ASSETS = [
  'encrypted-storage.wasm.gz',
  'encrypted-storage.did',
  'encrypted-storage.most',
  'storage-frontend.tar',
  'storage-release.json',
];

export const CONTENT_TYPES = {
  'encrypted-storage.did': 'text/plain',
  'encrypted-storage.most': 'text/plain',
  'encrypted-storage.wasm.gz': 'application/gzip',
  'storage-frontend.tar': 'application/x-tar',
  'storage-release.json': 'application/json',
};

export function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }

  return args;
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

export function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJson(path, value) {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function sha256File(path) {
  return sha256Buffer(readFileSync(path));
}

export function normalizeStorageTag(tagOrVersion) {
  const value = String(tagOrVersion ?? '').trim();
  if (!value) return value;
  if (value.startsWith(STORAGE_TAG_PREFIX)) return value;
  if (value.startsWith('v')) return `${STORAGE_TAG_PREFIX}${value.slice(1)}`;
  return `${STORAGE_TAG_PREFIX}${value}`;
}

export function versionFromTag(tagOrVersion) {
  return String(tagOrVersion ?? '')
    .replace(/^refs\/tags\//, '')
    .replace(new RegExp(`^${STORAGE_TAG_PREFIX}`), '')
    .replace(/^v/, '');
}

export function compareReleaseDateDesc(a, b) {
  const aTime = Date.parse(a.published_at ?? a.created_at ?? '') || 0;
  const bTime = Date.parse(b.published_at ?? b.created_at ?? '') || 0;
  return bTime - aTime;
}

export function latestRelease(releases) {
  return [...releases].sort(compareReleaseDateDesc)[0] ?? null;
}

export function bumpStorageVersion(version, bump = 'patch') {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(versionFromTag(version));
  if (!match) return '0.1.0';

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Unsupported storage dev release bump: ${bump}`);
  }
}

export function githubTimestamp(value = new Date()) {
  const text = value instanceof Date
    ? value.toISOString()
    : String(value);
  return text.replace(/\.\d+Z$/, 'Z');
}

export function removePath(path) {
  rmSync(path, { recursive: true, force: true });
}

export function copyIfExists(source, target) {
  if (!existsSync(source)) return false;
  ensureDir(dirname(target));
  copyFileSync(source, target);
  return true;
}

export function releaseApiPath(mockRoot, local = false) {
  return join(mockRoot, 'api', local ? 'releases.local.json' : 'releases.json');
}

export function releaseAssetsRoot(mockRoot) {
  return join(mockRoot, 'assets');
}

export function releaseDir(mockRoot, tagName) {
  return join(releaseAssetsRoot(mockRoot), tagName);
}

export function assetPublicUrl(tagName, assetName) {
  return `http://mock-server:8080/assets/${tagName}/${assetName}`;
}

export function releasePublicUrl(tagName) {
  return `http://mock-server:8080/releases/tag/${tagName}`;
}

export function assetMetadata(path) {
  return {
    size: statSync(path).size,
    digest: `sha256:${sha256File(path)}`,
  };
}

export function listReleaseAssetNames(dir) {
  return REQUIRED_STORAGE_ASSETS.filter((name) => existsSync(join(dir, name)));
}

export function buildMockReleaseEntry({
  body,
  createdAt,
  draft = false,
  id,
  name,
  prerelease = false,
  releaseDirPath,
  tagName,
}) {
  const assetNames = listReleaseAssetNames(releaseDirPath);
  const normalizedCreatedAt = githubTimestamp(createdAt);

  return {
    url: `http://mock-server:8080/repos/mock/releases/releases/${id}`,
    html_url: releasePublicUrl(tagName),
    id,
    tag_name: tagName,
    name: name ?? `Storage ${tagName}`,
    body: body ?? `Local mock release ${tagName}`,
    draft,
    prerelease,
    immutable: false,
    created_at: normalizedCreatedAt,
    published_at: normalizedCreatedAt,
    assets: assetNames.map((assetName, index) => {
      const metadata = assetMetadata(join(releaseDirPath, assetName));
      return {
        url: assetPublicUrl(tagName, assetName),
        id: id * 100 + index + 1,
        name: assetName,
        label: '',
        content_type: CONTENT_TYPES[assetName] ?? 'application/octet-stream',
        size: metadata.size,
        created_at: normalizedCreatedAt,
        updated_at: normalizedCreatedAt,
        digest: metadata.digest,
      };
    }),
  };
}

export function mergeRelease(releases, release) {
  return [
    release,
    ...releases.filter((item) => item.tag_name !== release.tag_name),
  ].sort(compareReleaseDateDesc);
}

export function assertRequiredAssets(dir) {
  const missing = REQUIRED_STORAGE_ASSETS.filter((name) => !existsSync(join(dir, name)));
  if (missing.length > 0) {
    throw new Error(`Missing release asset(s) in ${relative(REPO_ROOT, dir)}: ${missing.join(', ')}`);
  }
}
