#!/usr/bin/env node

import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, extname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const STORAGE_TAG_PREFIX = 'storage-v';
const INITIAL_STORAGE_RELEASE_VERSION = '0.1.0';
const DEFAULT_RELEASE_NOTES_DIR = 'apps/backend/release-notes';
const STABLE_SIGNATURE_ASSET_NAME = 'encrypted-storage.most';
const VERIFY_WASM_SCRIPT = 'apps/backend/scripts/build-storage-release-wasm.sh';
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = resolve(SCRIPT_DIR, '..');

const STORAGE_SCOPES = new Set([
  'storage',
  'encrypted-storage',
  'storage-deployer',
]);

const STORAGE_PATH_PREFIXES = [
  'apps/storage/',
  'libs/encrypted-storage/',
  'libs/motoko/encrypted-storage/',
  'apps/backend/src/StorageDeployer/',
  'apps/backend/src/Subscriptions/',
  'apps/backend/src/KnownWasmHashes/',
  'apps/backend/mock/',
  'apps/backend/scripts/build-storage-release-manifest.mjs',
  '.github/workflows/release-storage.yml',
];

const STORAGE_PATHS = new Set([
  'apps/backend/src/EncryptedStorageCanister.mo',
  'apps/backend/src/SubscriptionGate.mo',
]);

const ARTIFACTS = {
  wasm: ['encrypted-storage.wasm.gz'],
  wasmModule: ['encrypted-storage.wasm'],
  frontend: ['storage-frontend.tar'],
  did: ['encrypted-storage.did'],
  stableSignature: ['encrypted-storage.most'],
  jsLibrary: ['encrypted-storage-lib.zip'],
};

const SUPPORTED_ARG_STRATEGIES = new Set(['reuseInstallArgV1']);

const CONTENT_TYPES = [
  ['html', 'text/html'],
  ['css', 'text/css'],
  ['br', 'application/brotli'],
  ['js', 'text/javascript'],
  ['json', 'application/json'],
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'],
  ['svg', 'image/svg+xml'],
  ['ico', 'image/x-icon'],
  ['woff', 'font/woff'],
  ['woff2', 'font/woff2'],
  ['ttf', 'font/ttf'],
  ['eot', 'application/vnd.ms-fontobject'],
  ['txt', 'text/plain'],
  ['xml', 'application/xml'],
  ['pdf', 'application/pdf'],
  ['zip', 'application/zip'],
  ['wasm', 'application/wasm'],
  ['gz', 'application/gzip'],
];

function parseArgs(argv) {
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

function git(args, { optional = false } = {}) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', optional ? 'ignore' : 'pipe'],
    }).trim();
  } catch (error) {
    if (optional) return '';
    throw error;
  }
}

function normalizeVersion(version) {
  return version
    .replace(/^refs\/tags\//, '')
    .replace(new RegExp(`^${STORAGE_TAG_PREFIX}`), '')
    .replace(/^v/, '');
}

function validateVersion(version) {
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Storage release version must be semver-like, got "${version}"`);
  }
}

function parseVersion(version) {
  const normalized = normalizeVersion(version);
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(normalized);
  if (!match) {
    throw new Error(`Storage release version must be semver-like, got "${version}"`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
    raw: normalized,
  };
}

function comparePrereleaseIdentifier(left, right) {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);

  if (leftNumeric && rightNumeric) return Number(left) - Number(right);
  if (leftNumeric) return -1;
  if (rightNumeric) return 1;
  return left.localeCompare(right);
}

function compareVersion(leftVersion, rightVersion) {
  const left = typeof leftVersion === 'string' ? parseVersion(leftVersion) : leftVersion;
  const right = typeof rightVersion === 'string' ? parseVersion(rightVersion) : rightVersion;

  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] - right[key];
  }

  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0;
  if (left.prerelease.length === 0) return 1;
  if (right.prerelease.length === 0) return -1;

  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left.prerelease[index];
    const rightIdentifier = right.prerelease[index];

    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;

    const result = comparePrereleaseIdentifier(leftIdentifier, rightIdentifier);
    if (result !== 0) return result;
  }

  return 0;
}

function bumpVersion(previousVersion, bump) {
  const normalized = normalizeVersion(previousVersion || '0.0.0');
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(normalized);
  if (!match) {
    throw new Error(`Cannot auto-increment non-semver storage version "${previousVersion}"`);
  }

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
      throw new Error('No storage release bump found in Conventional Commits');
  }
}

function prereleaseLabel(args) {
  const value = args.prerelease ?? process.env.STORAGE_RELEASE_PRERELEASE;
  if (!value) return null;

  const label = value === true ? 'rc' : String(value).trim();
  if (!/^[0-9A-Za-z][0-9A-Za-z.-]*$/.test(label)) {
    throw new Error(`Storage release prerelease label must be semver-like, got "${label}"`);
  }

  return label;
}

function nextPrereleaseVersion(baseVersion, label) {
  const parsed = parseVersion(baseVersion);
  const base = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
  const tagPrefix = `${STORAGE_TAG_PREFIX}${base}-${label}.`;
  const rawTags = git(['tag', '--list', `${tagPrefix}*`], { optional: true });
  let latest = 0;

  for (const tag of rawTags.split('\n').map(item => item.trim()).filter(Boolean)) {
    const suffix = tag.slice(tagPrefix.length);
    if (!/^\d+$/.test(suffix)) continue;
    latest = Math.max(latest, Number(suffix));
  }

  return `${base}-${label}.${latest + 1}`;
}

function applyPrerelease(args, version) {
  const label = prereleaseLabel(args);
  if (!label) return version;

  const parsed = parseVersion(version);
  if (parsed.prerelease.length > 0) return parsed.raw;

  return nextPrereleaseVersion(parsed.raw, label);
}

function inferVersion(args, previousTag, changelog) {
  const explicitVersion = args.version ?? process.env.STORAGE_RELEASE_VERSION;
  if (explicitVersion) return applyPrerelease(args, normalizeVersion(explicitVersion));

  const refName = process.env.GITHUB_REF_NAME;
  if (refName?.startsWith(STORAGE_TAG_PREFIX)) {
    return applyPrerelease(args, normalizeVersion(refName));
  }

  const exactTag = git(['describe', '--tags', '--exact-match', '--match', `${STORAGE_TAG_PREFIX}*`], { optional: true });
  if (exactTag) return applyPrerelease(args, normalizeVersion(exactTag));

  if (args['auto-version'] || process.env.STORAGE_RELEASE_AUTO_VERSION === 'true') {
    if (!previousTag) {
      return applyPrerelease(args, normalizeVersion(process.env.STORAGE_RELEASE_INITIAL_VERSION ?? INITIAL_STORAGE_RELEASE_VERSION));
    }
    return applyPrerelease(args, bumpVersion(previousTag, changelog.bump));
  }

  return applyPrerelease(args, '0.0.0-dev');
}

function inferPreviousTag(args, toRef) {
  if (args.from) return args.from;
  if (args['previous-tag']) return args['previous-tag'];
  if (process.env.STORAGE_RELEASE_PREVIOUS_TAG) return process.env.STORAGE_RELEASE_PREVIOUS_TAG;

  return git(['describe', '--tags', '--match', `${STORAGE_TAG_PREFIX}*`, '--abbrev=0', `${toRef}^`], { optional: true });
}

function currentCommit(toRef) {
  return git(['rev-parse', toRef]);
}

function commitRange(previousTag, toRef) {
  return previousTag ? `${previousTag}..${toRef}` : toRef;
}

function parseCommitLog(raw) {
  if (!raw) return [];

  return raw
    .split('\x1e')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      const [hash, subject, body = ''] = entry.split('\x1f');
      return { hash, subject, body };
    });
}

function getCommits(range, maxCommits) {
  const args = ['log', '--format=%H%x1f%s%x1f%b%x1e'];
  if (maxCommits) args.push(`--max-count=${maxCommits}`);
  args.push(range);

  const raw = git(args, { optional: true });
  return parseCommitLog(raw);
}

function getCommitFiles(hash) {
  const raw = git(['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', hash], { optional: true });
  return raw ? raw.split('\n').filter(Boolean) : [];
}

function parseConventionalCommit(subject) {
  const match = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:\s+(?<description>.+)$/.exec(subject);
  if (!match?.groups) {
    return {
      type: 'other',
      scope: null,
      breaking: false,
      description: subject,
    };
  }

  return {
    type: match.groups.type,
    scope: match.groups.scope ?? null,
    breaking: Boolean(match.groups.breaking),
    description: match.groups.description,
  };
}

function isBreaking(commit, parsed) {
  return parsed.breaking || /^BREAKING[ -]CHANGE:/m.test(commit.body);
}

function isStoragePath(file) {
  return STORAGE_PATHS.has(file) || STORAGE_PATH_PREFIXES.some(prefix => file.startsWith(prefix));
}

function isStorageCommit(commit, parsed, files) {
  if (parsed.scope && STORAGE_SCOPES.has(parsed.scope)) return true;
  return files.some(isStoragePath);
}

function sentence(text) {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const capitalized = trimmed[0].toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

function sectionKind(commit, parsed) {
  if (isBreaking(commit, parsed)) return 'breaking';
  if (parsed.type === 'feat') return 'features';
  if (parsed.type === 'fix') return 'fixes';
  if (parsed.type === 'perf') return 'performance';
  return 'other';
}

function shouldShowInChangelog(kind) {
  return kind !== 'other';
}

function changelogTitle(kind) {
  switch (kind) {
    case 'breaking':
      return 'Breaking changes';
    case 'features':
      return 'Features';
    case 'fixes':
      return 'Fixes';
    case 'performance':
      return 'Performance';
    default:
      return 'Other changes';
  }
}

function collectChangelog(commits, repoUrl) {
  const sections = new Map();
  let highestBump = 'none';

  for (const commit of commits) {
    const parsed = parseConventionalCommit(commit.subject);
    const files = getCommitFiles(commit.hash);
    if (!isStorageCommit(commit, parsed, files)) continue;

    const kind = sectionKind(commit, parsed);
    if (kind === 'breaking') highestBump = 'major';
    else if (parsed.type === 'feat' && highestBump !== 'major') highestBump = 'minor';
    else if ((parsed.type === 'fix' || parsed.type === 'perf') && highestBump === 'none') highestBump = 'patch';

    if (!shouldShowInChangelog(kind)) continue;

    if (!sections.has(kind)) {
      sections.set(kind, {
        kind,
        title: changelogTitle(kind),
        items: [],
      });
    }

    sections.get(kind).items.push({
      text: sentence(parsed.description),
      commit: commit.hash.slice(0, 7),
      commitUrl: buildCommitUrl(repoUrl, commit.hash),
    });
  }

  const orderedKinds = ['breaking', 'features', 'fixes', 'performance'];
  const orderedSections = orderedKinds
    .map(kind => sections.get(kind))
    .filter(Boolean);

  return {
    bump: highestBump,
    summary: summarizeChangelog(orderedSections),
    sections: orderedSections,
  };
}

function summarizeChangelog(sections) {
  const counts = Object.fromEntries(sections.map(section => [section.kind, section.items.length]));
  const parts = [];

  if (counts.breaking) parts.push(`${counts.breaking} breaking change${counts.breaking === 1 ? '' : 's'}`);
  if (counts.features) parts.push(`${counts.features} feature${counts.features === 1 ? '' : 's'}`);
  if (counts.fixes) parts.push(`${counts.fixes} fix${counts.fixes === 1 ? '' : 'es'}`);
  if (counts.performance) parts.push(`${counts.performance} performance improvement${counts.performance === 1 ? '' : 's'}`);

  return parts.length > 0
    ? `Storage release with ${parts.join(', ')}.`
    : 'Storage maintenance release.';
}

function validateReleaseNotesSection(section, index) {
  if (!section || typeof section !== 'object' || Array.isArray(section)) {
    throw new Error(`releaseNotes.sections[${index}] must be an object`);
  }
  if (typeof section.title !== 'string' || !section.title.trim()) {
    throw new Error(`releaseNotes.sections[${index}].title must be a non-empty string`);
  }
  if (!Array.isArray(section.items)) {
    throw new Error(`releaseNotes.sections[${index}].items must be an array`);
  }

  return {
    title: section.title.trim(),
    items: section.items.map((item, itemIndex) => {
      if (typeof item !== 'string' || !item.trim()) {
        throw new Error(`releaseNotes.sections[${index}].items[${itemIndex}] must be a non-empty string`);
      }
      return item.trim();
    }),
  };
}

function renderReleaseNotesMarkdown(releaseNotes) {
  const lines = ['## Release Notes', '', releaseNotes.summary, ''];

  for (const section of releaseNotes.sections) {
    lines.push(`### ${section.title}`, '');
    for (const item of section.items) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

function readReleaseNotes(path) {
  const content = readFileSync(path, 'utf8');
  const extension = extname(path).toLowerCase();
  if (extension && extension !== '.json') return readMarkdownReleaseNotes(content);

  const parsed = JSON.parse(content);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('releaseNotes file must contain a JSON object');
  }
  if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) {
    throw new Error('releaseNotes.summary must be a non-empty string');
  }
  if (!Array.isArray(parsed.sections)) {
    throw new Error('releaseNotes.sections must be an array');
  }

  const releaseNotes = {
    source: typeof parsed.source === 'string' && parsed.source.trim()
      ? parsed.source.trim()
      : 'manual',
    summary: parsed.summary.trim(),
    sections: parsed.sections.map(validateReleaseNotesSection),
  };

  return {
    markdown: renderReleaseNotesMarkdown(releaseNotes),
    releaseNotes,
  };
}

function readMarkdownReleaseNotes(content) {
  const markdown = content.trim();
  if (!markdown) {
    throw new Error('Release notes markdown file must not be empty');
  }

  const releaseNotes = releaseNotesFromMarkdown(markdown);
  return {
    markdown,
    releaseNotes,
  };
}

function releaseNotesFromMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const summary = markdownSummary(lines);
  const sections = markdownSections(lines);

  return {
    source: 'manual',
    summary,
    sections,
  };
}

function markdownSummary(lines) {
  const paragraph = [];
  let seenContent = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (paragraph.length > 0) break;
      continue;
    }
    if (/^#{1,6}\s+/.test(trimmed)) {
      seenContent = true;
      continue;
    }
    paragraph.push(trimmed.replace(/^[-*]\s+/, ''));
    seenContent = true;
  }

  if (paragraph.length > 0) return paragraph.join(' ');

  const firstHeading = lines
    .map(line => line.trim())
    .find(line => /^#{1,6}\s+/.test(line));
  if (firstHeading) return firstHeading.replace(/^#{1,6}\s+/, '').trim();

  if (!seenContent) throw new Error('Release notes markdown file must not be empty');
  return 'Storage release notes.';
}

function markdownSections(lines) {
  const sections = [];
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const heading = /^(#{2,6})\s+(.+)$/.exec(trimmed);
    if (heading) {
      current = {
        title: heading[2].trim(),
        items: [],
      };
      sections.push(current);
      continue;
    }

    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    if (bullet) {
      if (!current) {
        current = { title: 'Highlights', items: [] };
        sections.push(current);
      }
      current.items.push(bullet[1].trim());
    }
  }

  return sections.filter(section => section.items.length > 0);
}

function releaseNotesFromChangelog(changelog) {
  return {
    source: 'generated',
    summary: changelog.summary,
    sections: changelog.sections.map(section => ({
      title: section.title,
      items: section.items.map(item => item.text),
    })),
  };
}

function renderGeneratedChangelogMarkdown(changelog) {
  const lines = ['## What\'s Changed', '', changelog.summary, ''];

  for (const section of changelog.sections) {
    lines.push(`### ${section.title}`, '');
    for (const item of section.items) {
      const commit = item.commitUrl
        ? ` ([${item.commit}](${item.commitUrl}))`
        : item.commit
          ? ` (${item.commit})`
          : '';
      lines.push(`- ${item.text}${commit}`);
    }
    lines.push('');
  }

  if (changelog.sections.length === 0) {
    lines.push('- Maintenance release.', '');
  }

  return lines.join('\n').trim();
}

function defaultReleaseNotesPath(tagName) {
  const markdownPath = resolve(DEFAULT_RELEASE_NOTES_DIR, `${tagName}.md`);
  if (existsSync(markdownPath)) return markdownPath;

  const jsonPath = resolve(DEFAULT_RELEASE_NOTES_DIR, `${tagName}.json`);
  if (existsSync(jsonPath)) return jsonPath;

  return null;
}

function collectReleaseNotes(args, changelog, tagName) {
  const notesPath = args['release-notes'] ?? process.env.STORAGE_RELEASE_NOTES;
  if (notesPath) return readReleaseNotes(resolve(notesPath));

  const defaultPath = defaultReleaseNotesPath(tagName);
  if (defaultPath) return readReleaseNotes(defaultPath);

  const releaseNotes = releaseNotesFromChangelog(changelog);
  return {
    markdown: renderGeneratedChangelogMarkdown(changelog),
    releaseNotes,
  };
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function isAppleDoubleFile(name) {
  return name.includes('/._') || name.startsWith('._');
}

function inferContentType(path) {
  for (const [extension, contentType] of CONTENT_TYPES) {
    if (path.endsWith(`.${extension}`)) return contentType;
  }
  return 'application/octet-stream';
}

function contentEncoding(key) {
  if (key.endsWith('.gz')) return 'gzip';
  if (key.endsWith('.br')) return 'br';
  return 'identity';
}

function listFrontendFiles(frontendDirPath) {
  if (!existsSync(frontendDirPath) || !statSync(frontendDirPath).isDirectory()) {
    throw new Error(`Frontend directory not found: ${frontendDirPath}`);
  }

  const files = [];

  function visit(dirPath, relativePrefix = '') {
    for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
      const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
      if (isAppleDoubleFile(relativePath)) continue;

      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath, relativePath);
        continue;
      }
      if (!entry.isFile()) continue;

      const key = `/${relativePath}`;
      const content = readFileSync(fullPath);
      files.push({
        key,
        contentType: inferContentType(key),
        contentEncoding: contentEncoding(key),
        size: content.length,
        sha256: sha256Buffer(content),
      });
    }
  }

  visit(frontendDirPath);
  return files.sort((a, b) => a.key.localeCompare(b.key));
}

function frontendAssetTreeHash(frontendDirPath) {
  const hash = createHash('sha256');
  hash.update('rabbithole-storage-frontend-assets-v1\n');

  for (const file of listFrontendFiles(frontendDirPath)) {
    for (const value of [file.key, file.contentType, file.contentEncoding, String(file.size), file.sha256]) {
      hash.update(`${value.length}:${value}`);
    }
  }

  return hash.digest('hex');
}

function artifactMetadata(artifactsDir, names) {
  for (const name of names) {
    const path = join(artifactsDir, name);
    if (!existsSync(path)) continue;

    return {
      name,
      size: statSync(path).size,
      sha256: sha256(path),
    };
  }

  return null;
}

function collectArtifacts(artifactsDir) {
  const artifacts = {};

  for (const [key, names] of Object.entries(ARTIFACTS)) {
    const metadata = artifactMetadata(artifactsDir, names);
    if (metadata) artifacts[key] = metadata;
  }

  for (const key of ['wasm', 'frontend']) {
    if (!artifacts[key]) {
      throw new Error(`Missing required storage release artifact in ${artifactsDir}: ${ARTIFACTS[key].join(' or ')}`);
    }
  }

  return artifacts;
}

function parseList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .map(normalizeVersion);
}

function storageTagVersions(args) {
  const raw = git(['tag', '--list', `${STORAGE_TAG_PREFIX}*`], { optional: true });
  const versions = new Set();

  for (const tag of raw.split('\n').map(item => item.trim()).filter(Boolean)) {
    versions.add(normalizeVersion(tag));
  }

  const historyDir = args['stable-signature-history-dir'] ?? process.env.STORAGE_RELEASE_STABLE_SIGNATURE_HISTORY_DIR;
  if (historyDir && existsSync(resolve(historyDir))) {
    for (const entry of readdirSync(resolve(historyDir), { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith(STORAGE_TAG_PREFIX)) {
        versions.add(normalizeVersion(entry.name));
      }
    }
  }

  return [...versions];
}

function inferCompatibleFrom(args, version, currentStableSignaturePath, repoUrl) {
  const current = parseVersion(version);
  const seen = new Set();
  const moc = resolveMoc(args);

  return storageTagVersions(args)
    .map(tagVersion => {
      if (seen.has(tagVersion)) return false;
      seen.add(tagVersion);

      let candidate;
      try {
        candidate = parseVersion(tagVersion);
      } catch {
        return false;
      }
      if (compareVersion(candidate, current) >= 0) return false;

      const previousStableSignaturePath = resolvePreviousStableSignature(args, `${STORAGE_TAG_PREFIX}${tagVersion}`, repoUrl);
      if (!previousStableSignaturePath) return false;

      return stableSignaturesCompatible(moc, previousStableSignaturePath, currentStableSignaturePath)
        ? tagVersion
        : false;
    })
    .filter(Boolean)
    .sort(compareVersion);
}

function resolveCompatibleFrom(value, version, args, currentStableSignaturePath, repoUrl) {
  if (value === undefined || value === null) {
    return inferCompatibleFrom(args, version, currentStableSignaturePath, repoUrl);
  }

  const normalized = String(value).trim();
  if (!normalized || normalized === 'none') return [];
  if (normalized === 'auto') {
    return inferCompatibleFrom(args, version, currentStableSignaturePath, repoUrl);
  }

  return parseList(normalized);
}

function resolveMoc(args) {
  if (args.moc) return resolve(args.moc);
  if (process.env.STORAGE_RELEASE_MOC) return process.env.STORAGE_RELEASE_MOC;

  try {
    return execFileSync('mops', ['toolchain', 'bin', 'moc'], {
      cwd: BACKEND_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'moc';
  }
}

function resolvePreviousStableSignature(args, tagName, repoUrl) {
  const historyDir = args['stable-signature-history-dir'] ?? process.env.STORAGE_RELEASE_STABLE_SIGNATURE_HISTORY_DIR;
  if (historyDir) {
    const baseDir = resolve(historyDir);
    const candidates = [
      join(baseDir, tagName, STABLE_SIGNATURE_ASSET_NAME),
      join(baseDir, `${tagName}.most`),
    ];
    const existing = candidates.find(candidate => existsSync(candidate));
    if (existing) return existing;
    console.warn(`No stable signature found for ${tagName} in ${baseDir}; skipping compatibility.`);
    return null;
  }

  if (!repoUrl) {
    console.warn(`No repository URL available to fetch ${tagName}/${STABLE_SIGNATURE_ASSET_NAME}; skipping compatibility.`);
    return null;
  }

  const url = `${repoUrl}/releases/download/${tagName}/${STABLE_SIGNATURE_ASSET_NAME}`;
  const target = join(mkdtempSync(join(tmpdir(), 'storage-release-most-')), `${tagName}.most`);

  try {
    const content = execFileSync('curl', ['-fsSL', url], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    writeFileSync(target, content);
    return target;
  } catch {
    console.warn(`Could not fetch stable signature for ${tagName}; skipping compatibility.`);
    return null;
  }
}

function stableSignaturesCompatible(moc, previousStableSignaturePath, currentStableSignaturePath) {
  try {
    execFileSync(moc, ['--stable-compatible', previousStableSignaturePath, currentStableSignaturePath], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

function normalizeGitRemoteUrl(remoteUrl) {
  const trimmed = remoteUrl.trim();
  if (!trimmed) return null;

  const sshMatch = /^git@([^:]+):(.+)$/.exec(trimmed);
  if (sshMatch) {
    return `https://${sshMatch[1]}/${sshMatch[2].replace(/\.git$/, '')}`;
  }

  const sshUrlMatch = /^ssh:\/\/git@([^/]+)\/(.+)$/.exec(trimmed);
  if (sshUrlMatch) {
    return `https://${sshUrlMatch[1]}/${sshUrlMatch[2].replace(/\.git$/, '')}`;
  }

  if (/^https?:\/\//.test(trimmed)) {
    return trimmed.replace(/\.git$/, '');
  }

  return null;
}

function repositoryUrl(args) {
  if (args['repo-url']) return args['repo-url'];
  if (process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY) {
    return `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}`;
  }
  const remoteUrl = git(['config', '--get', 'remote.origin.url'], { optional: true });
  if (remoteUrl) return normalizeGitRemoteUrl(remoteUrl);
  return null;
}

function buildCommitUrl(repoUrl, commitHash) {
  if (!repoUrl || !commitHash) return null;
  return `${repoUrl}/commit/${commitHash}`;
}

function buildCompareUrl(repoUrl, previousTag, tagName) {
  if (!repoUrl || !previousTag) return null;
  return `${repoUrl}/compare/${previousTag}...${tagName}`;
}

function buildManifest(args) {
  const artifactsDir = resolve(args['artifacts-dir'] ?? 'release-artifacts');
  const frontendDir = resolve(args['frontend-dir'] ?? process.env.STORAGE_RELEASE_FRONTEND_DIR ?? 'dist/apps/storage/browser');
  const toRef = args.to ?? process.env.GITHUB_SHA ?? 'HEAD';
  const previousTag = inferPreviousTag(args, toRef);
  const range = commitRange(previousTag, toRef);
  const commit = currentCommit(toRef);
  const repoUrl = repositoryUrl(args);
  const maxCommits = Number(args['max-commits'] ?? process.env.STORAGE_RELEASE_MAX_COMMITS ?? (previousTag ? 0 : 50));
  const changelog = collectChangelog(getCommits(range, maxCommits), repoUrl);
  const version = inferVersion(args, previousTag, changelog);
  validateVersion(version);

  const tagName = `${STORAGE_TAG_PREFIX}${version}`;
  const changelogRange = {
    from: previousTag || null,
    to: tagName,
    compareUrl: buildCompareUrl(repoUrl, previousTag, tagName),
    maxCommits: maxCommits || null,
  };
  const releaseNotes = collectReleaseNotes(args, changelog, tagName);
  const argStrategy = args['arg-strategy'] ?? process.env.STORAGE_RELEASE_ARG_STRATEGY ?? 'reuseInstallArgV1';
  const artifacts = collectArtifacts(artifactsDir);
  const stableSignaturePath = artifacts.stableSignature
    ? join(artifactsDir, artifacts.stableSignature.name)
    : null;
  const compatibleFrom = stableSignaturePath
    ? resolveCompatibleFrom(
      args['compatible-from'] ?? process.env.STORAGE_RELEASE_COMPATIBLE_FROM,
      version,
      args,
      stableSignaturePath,
      repoUrl,
    )
    : [];
  const manifest = {
    schemaVersion: 1,
    version,
    tagName,
    commit,
    frontendAssetTreeHash: frontendAssetTreeHash(frontendDir),
    artifacts,
    upgrade: {
      argStrategy,
      compatibleFrom,
    },
    releaseNotes: releaseNotes.releaseNotes,
  };

  validateReleaseContract(manifest);
  return { changelog, changelogRange, manifest, releaseBodyMarkdown: releaseNotes.markdown, repoUrl };
}

function validateReleaseContract(manifest) {
  if (!SUPPORTED_ARG_STRATEGIES.has(manifest.upgrade.argStrategy)) {
    throw new Error(`Unsupported storage release arg strategy: ${manifest.upgrade.argStrategy}`);
  }

  if (!manifest.artifacts.stableSignature) {
    throw new Error('Missing encrypted-storage.most. Storage releases must attach the Motoko stable type signature.');
  }

  if (!manifest.frontendAssetTreeHash) {
    throw new Error('Missing frontendAssetTreeHash.');
  }
}

function renderReleaseBody(manifest, releaseBodyMarkdown, repoUrl, changelogRange) {
  const lines = [
    `This is storage release [${manifest.tagName}](${releaseDownloadBaseUrl(manifest, repoUrl)}) for commit [${manifest.commit}](${commitUrl(manifest, repoUrl) ?? manifest.commit}).`,
    '',
    releaseBodyMarkdown,
    '',
  ];

  if (changelogRange.compareUrl) {
    lines.push(`**Full Changelog**: ${changelogRange.compareUrl}`, '');
  }

  lines.push('## Upgrade Compatibility', '');
  lines.push(`- Version: \`${manifest.version}\``);
  lines.push(`- Commit: \`${manifest.commit}\``);
  lines.push(`- Argument strategy: \`${manifest.upgrade.argStrategy}\``);
  lines.push(`- Compatible from: ${manifest.upgrade.compatibleFrom.length > 0 ? manifest.upgrade.compatibleFrom.map(version => `\`${version}\``).join(', ') : '`none declared`'}`);
  lines.push(`- Frontend asset tree: \`sha256:${manifest.frontendAssetTreeHash}\``);
  lines.push('');
  lines.push('## Artifacts', '');
  lines.push('| File | Size | SHA256 |');
  lines.push('| --- | ---: | --- |');

  for (const artifact of Object.values(manifest.artifacts)) {
    lines.push(`| [${artifact.name}](${artifactDownloadUrl(manifest, artifact.name, repoUrl)}) | ${artifact.size} bytes | \`${artifact.sha256}\` |`);
  }

  lines.push('');
  lines.push('## Wasm Verification', '');
  lines.push('To rebuild the storage WASM module and verify its hash, run:');
  lines.push('');
  lines.push('```sh');
  lines.push(`git checkout ${manifest.commit}`);
  lines.push('npm install -g @icp-sdk/icp-cli@1.0.0 @icp-sdk/ic-wasm ic-mops@2.14.1');
  lines.push(`${VERIFY_WASM_SCRIPT}`);
  lines.push('shasum -a 256 apps/backend/.icp/cache/artifacts/encrypted-storage');
  lines.push('```');
  lines.push('');
  lines.push(`Expected storage WASM sha256: \`${manifest.artifacts.wasm.sha256}\``);
  lines.push('');
  lines.push('The machine-readable release contract is attached as `storage-release.json`.');
  lines.push('');

  return lines.join('\n');
}

function releaseDownloadBaseUrl(manifest, repoUrl) {
  return repoUrl ? `${repoUrl}/releases/tag/${manifest.tagName}` : manifest.tagName;
}

function artifactDownloadUrl(manifest, artifactName, repoUrl) {
  if (!repoUrl) return artifactName;
  return `${repoUrl}/releases/download/${manifest.tagName}/${artifactName}`;
}

function commitUrl(manifest, repoUrl) {
  return buildCommitUrl(repoUrl, manifest.commit);
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function writeGitHubOutputs(manifest, changelog, changelogRange) {
  if (!process.env.GITHUB_OUTPUT) return;

  const lines = [
    `version=${manifest.version}`,
    `tag_name=${manifest.tagName}`,
    `changelog_bump=${changelog.bump}`,
    `arg_strategy=${manifest.upgrade.argStrategy}`,
    `frontend_asset_tree_hash=${manifest.frontendAssetTreeHash}`,
  ];

  if (changelogRange.from) {
    lines.push(`previous_tag=${changelogRange.from}`);
  }

  writeFileSync(process.env.GITHUB_OUTPUT, lines.join('\n'), { flag: 'a' });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { changelog, changelogRange, manifest, releaseBodyMarkdown, repoUrl } = buildManifest(args);
  const artifactsDir = resolve(args['artifacts-dir'] ?? 'release-artifacts');
  const output = resolve(args.output ?? join(artifactsDir, 'storage-release.json'));

  writeJson(output, manifest);

  const bodyPath = args['release-body'];
  if (bodyPath) {
    const resolvedBodyPath = resolve(bodyPath);
    mkdirSync(dirname(resolvedBodyPath), { recursive: true });
    writeFileSync(resolvedBodyPath, renderReleaseBody(manifest, releaseBodyMarkdown, repoUrl, changelogRange));
  }

  writeGitHubOutputs(manifest, changelog, changelogRange);

  console.log(`Wrote ${basename(output)} for ${manifest.tagName}`);
}

main();
