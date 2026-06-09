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
runDeployWithCycleRetries();
run('bash', ['scripts/sync-env.sh', 'local']);

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

function runDeployWithCycleRetries() {
  const maxAttempts = 6;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    console.log(`[reset-local] icp deploy -e local`);
    const result = spawnSync('icp', ['deploy', '-e', 'local'], {
      cwd: backendDir,
      env: process.env,
      encoding: 'utf8',
    });

    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }

    if (result.error) {
      throw result.error;
    }
    if (result.status === 0) {
      return;
    }

    const topUps = parseCycleTopUps(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);

    if (topUps.length === 0 || attempt === maxAttempts) {
      process.exit(result.status ?? 1);
    }

    for (const { canister, amount } of topUps) {
      console.log(`[reset-local] ${canister} needs cycles; topping up ${amount}`);
      run('icp', ['canister', 'top-up', '-e', 'local', '--amount', String(amount), canister]);
    }
  }
}

function parseCycleTopUps(output) {
  const topUps = new Map();
  const blockPattern =
    /Failed to install canister '([^']+)':([\s\S]*?)(?=ERR ----- Failed to install canister '|Error: Canister\(s\)|$)/g;

  for (const match of output.matchAll(blockPattern)) {
    const canister = match[1];
    const block = match[2];
    const shortageMatch = block.match(/[Aa]t least\s+([\d_]+)\s+additional cycles/);

    if (!shortageMatch) {
      continue;
    }

    const required = Number(shortageMatch[1].replaceAll('_', ''));
    const buffer = block.includes('cannot grow memory')
      ? 250_000_000_000
      : 75_000_000_000;
    const amount = roundUpToBillion(required + buffer);
    topUps.set(canister, Math.max(topUps.get(canister) ?? 0, amount));
  }

  return [...topUps.entries()].map(([canister, amount]) => ({ canister, amount }));
}

function roundUpToBillion(amount) {
  return Math.ceil(amount / 1_000_000_000) * 1_000_000_000;
}
