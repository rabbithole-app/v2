#!/usr/bin/env node
// Bootstrap the local icp-cli environment after docker compose brings up
// the network launcher. Idempotent — safe to run multiple times.
//
// 1. Wait for launcher's status.json + topology.json
// 2. Patch networks/local.yaml with the live root-key
// 3. Create xrc / sol_rpc / evm_rpc on the fiduciary subnet (pinned; idempotent)
// 4. Create internet_identity_backend first, write its principal into
//    init-args/internet_identity_frontend.did (the II frontend canister
//    needs the backend's id at install time).
//
// Does NOT deploy canisters — that's what `icp deploy -e local` is for.

import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, '..');

const STATUS_FILE = path.join(BACKEND_DIR, '.icp-status', 'status.json');
const TOPOLOGY_FILE = path.join(BACKEND_DIR, '.icp-state', 'topology.json');
const LOCAL_NETWORK_YAML = path.join(BACKEND_DIR, 'networks', 'local.yaml');
const II_FRONTEND_ARGS = path.join(BACKEND_DIR, 'init-args', 'internet_identity_frontend.did');

const FIDUCIARY_PINNED = ['xrc', 'sol_rpc', 'evm_rpc'];

function canisterExists(name) {
  try {
    execSync(`icp canister status ${name} -e local`, {
      cwd: BACKEND_DIR,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

function canisterId(name) {
  return execSync(`icp canister status ${name} -e local -i`, {
    cwd: BACKEND_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function main() {
  console.log('[bootstrap] waiting for launcher status...');
  await waitForFile(STATUS_FILE);
  await waitForFile(TOPOLOGY_FILE);

  const { root_key } = JSON.parse(await fs.readFile(STATUS_FILE, 'utf8'));
  const yaml = await fs.readFile(LOCAL_NETWORK_YAML, 'utf8');
  const patched = yaml.replace(/^(root-key: ")[^"]+(")/m, `$1${root_key}$2`);
  if (patched !== yaml) {
    await fs.writeFile(LOCAL_NETWORK_YAML, patched);
    console.log('[bootstrap] networks/local.yaml: root-key refreshed');
  }

  const topology = JSON.parse(await fs.readFile(TOPOLOGY_FILE, 'utf8'));
  const fid = topology.subnet_configs.find(
    (s) => s.subnet_kind === 'Fiduciary',
  );
  if (!fid)
    throw new Error(
      'Fiduciary subnet not in topology — is --subnet=fiduciary set on the launcher?',
    );
  const fidPrincipal = fid.subnet_id;
  console.log(`[bootstrap] fiduciary subnet: ${fidPrincipal}`);

  for (const name of FIDUCIARY_PINNED) {
    if (canisterExists(name)) continue;
    console.log(`[bootstrap] creating ${name} on fiduciary subnet...`);
    execSync(
      `icp canister create ${name} -e local --subnet ${fidPrincipal} --cycles 20t`,
      {
        cwd: BACKEND_DIR,
        stdio: 'inherit',
      },
    );
  }

  if (!canisterExists('internet_identity_backend')) {
    console.log('[bootstrap] creating internet_identity_backend...');
    execSync(
      `icp canister create internet_identity_backend -e local --cycles 20t`,
      { cwd: BACKEND_DIR, stdio: 'inherit' },
    );
  }
  const iiBackendId = canisterId('internet_identity_backend');
  const iiArgs = await fs.readFile(II_FRONTEND_ARGS, 'utf8');
  const patchedIi = iiArgs
    .replace(/backend_canister_id = principal "[^"]+"/, `backend_canister_id = principal "${iiBackendId}"`)
    .replace(/backend_origin = "[^"]+"/, `backend_origin = "http://${iiBackendId}.localhost:8000"`);
  if (patchedIi !== iiArgs) {
    await fs.writeFile(II_FRONTEND_ARGS, patchedIi);
    console.log(`[bootstrap] init-args/internet_identity_frontend.did: backend_canister_id → ${iiBackendId}`);
  }

  console.log('[bootstrap] done. Next: `icp deploy -e local`');
}

async function waitForFile(p, timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fs.access(p);
      return;
    } catch {
      // Not ready yet — retry after sleep.
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timeout waiting for ${p}`);
}

main().catch((err) => {
  console.error('[bootstrap] FAILED:', err.message);
  process.exit(1);
});
