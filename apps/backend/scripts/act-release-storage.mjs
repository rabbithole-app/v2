#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../../..');

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

function commandExists(command) {
  try {
    execFileSync('sh', ['-c', `command -v ${command}`], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!commandExists('act')) {
    throw new Error('act is not installed or not available in PATH');
  }

  const workDir = mkdtempSync(join(tmpdir(), 'storage-release-act-'));
  const eventPath = join(workDir, 'workflow-dispatch.json');
  const artifactDir = resolve(args['artifact-dir'] ?? join(workDir, 'artifacts'));
  const platform = String(args.platform ?? 'ubuntu-latest=ghcr.io/catthehacker/ubuntu:full-latest');
  const releaseMode = String(args['release-mode'] ?? 'dry-run');
  const releaseNotesFile = args['release-notes-file'] ? String(args['release-notes-file']) : '';
  const maxCommits = args['max-commits'] ? String(args['max-commits']) : '';
  const validateOnly = args['validate-only'] === true;

  writeFileSync(eventPath, `${JSON.stringify({
    inputs: {
      max_commits: maxCommits,
      release_mode: releaseMode,
      release_notes_file: releaseNotesFile,
    },
  }, null, 2)}\n`);

  const actArgs = [
    'workflow_dispatch',
    '-W',
    '.github/workflows/release-storage.yml',
    '-e',
    eventPath,
    '--artifact-server-path',
    artifactDir,
    '-P',
    platform,
  ];

  if (validateOnly) actArgs.push('-n');

  execFileSync('act', actArgs, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });

  if (!validateOnly) {
    console.log(`act artifacts: ${artifactDir}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
