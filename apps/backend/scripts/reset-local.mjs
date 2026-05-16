#!/usr/bin/env node
// Reset the local PocketIC state, start a fresh local network, bootstrap
// system canisters, then deploy.

import { spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, '..');

const pathsToRemove = [
  '.icp-state',
  '.icp-status',
  path.join('.icp', 'data', 'mappings', 'local.ids.json'),
];

process.env.COMPOSE_PROJECT_NAME ??= 'rabbithole';

run('docker', ['compose', 'down']);
await removeLocalState();
run('docker', ['compose', 'up', '-d', '--wait']);
run('node', ['scripts/bootstrap.mjs']);
run('node', ['scripts/generate-declarations.mjs']);
run('icp', ['deploy', '-e', 'local', '--cycles', '20t']);

console.log('[reset-local] done');

async function removeLocalState() {
  for (const relativePath of pathsToRemove) {
    await rm(path.join(backendDir, relativePath), {
      force: true,
      recursive: true,
    });
    console.log(`[reset-local] removed ${relativePath}`);
  }
}

function run(command, args) {
  console.log(`[reset-local] ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: backendDir,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
