#!/usr/bin/env node
// Bootstrap the local icp-cli environment after docker compose brings up
// the network launcher. Idempotent — safe to run multiple times.
//
// 1. Wait for launcher's status.json + topology.json
// 2. Patch networks/local.yaml with the live root-key
// 3. Create xrc on the system subnet and sol_rpc / evm_rpc on the fiduciary subnet (pinned; idempotent)
// 4. Create internet_identity_backend first, write its principal into
//    init-args/internet_identity_frontend.did (the II frontend canister
//    needs the backend's id at install time).
//
// Does NOT deploy canisters — that's what `icp deploy -e local` is for.

import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const {
  MANAGEMENT_CANISTER_ID,
  decodeCreateCanisterResponse,
  encodeCreateCanisterRequest,
} = require('@dfinity/pic/dist/management-canister');
const {
  base64Decode,
  base64Encode,
  base64EncodePrincipal,
} = require('@dfinity/pic/dist/util');
const { Principal } = require('@icp-sdk/core/principal');
const BACKEND_DIR = path.resolve(__dirname, '..');

const STATUS_FILE = path.join(BACKEND_DIR, '.icp-status', 'status.json');
const TOPOLOGY_FILE = path.join(BACKEND_DIR, '.icp-state', 'topology.json');
const LOCAL_IDS_FILE = path.join(BACKEND_DIR, '.icp', 'data', 'mappings', 'local.ids.json');
const LOCAL_NETWORK_YAML = path.join(BACKEND_DIR, 'networks', 'local.yaml');
const II_FRONTEND_ARGS = path.join(BACKEND_DIR, 'init-args', 'internet_identity_frontend.did');
const BACKEND_ARGS = path.join(BACKEND_DIR, 'init-args', 'rabbithole-backend.did');

const SYSTEM_PINNED = ['xrc'];
const FIDUCIARY_PINNED = ['sol_rpc', 'evm_rpc'];

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

async function createSystemCanister(systemPrincipal) {
  const { instance_id, config_port } = JSON.parse(await fs.readFile(STATUS_FILE, 'utf8'));
  const subnetId = Principal.fromText(systemPrincipal);
  const sender = Principal.anonymous();
  const payload = encodeCreateCanisterRequest({
    settings: [],
    amount: [20_000_000_000_000n],
    specified_id: [],
  });
  const response = await pocketIcUpdateCall({
    baseUrl: `http://127.0.0.1:${config_port}`,
    instanceId: instance_id,
    sender,
    canisterId: MANAGEMENT_CANISTER_ID,
    method: 'provisional_create_canister_with_cycles',
    payload,
    effectiveSubnetId: subnetId,
  });
  return decodeCreateCanisterResponse(response).canister_id.toText();
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
  const system = topology.subnet_configs.find(
    (s) => s.subnet_kind === 'System',
  ) ?? topology.subnet_configs.find(
    (s) => s.subnet_kind === 'II',
  );
  if (!system)
    throw new Error(
      'System/II subnet not in topology — is --subnet=system or --nns set on the launcher?',
    );
  const systemPrincipal = system.subnet_id;
  console.log(`[bootstrap] system subnet: ${systemPrincipal} (${system.subnet_kind})`);

  const fid = topology.subnet_configs.find(
    (s) => s.subnet_kind === 'Fiduciary',
  );
  if (!fid)
    throw new Error(
      'Fiduciary subnet not in topology — is --subnet=fiduciary set on the launcher?',
    );
  const fidPrincipal = fid.subnet_id;
  console.log(`[bootstrap] fiduciary subnet: ${fidPrincipal}`);

  const app = topology.subnet_configs.find(
    (s) => s.subnet_kind === 'Application',
  );
  if (!app)
    throw new Error(
      'Application subnet not in topology — is --subnet=application set on the launcher?',
    );
  const appPrincipal = app.subnet_id;
  console.log(`[bootstrap] application subnet: ${appPrincipal}`);

  for (const name of SYSTEM_PINNED) {
    if (canisterExists(name)) continue;
    console.log(`[bootstrap] creating ${name} on system subnet...`);
    const createdId = await createSystemCanister(systemPrincipal);
    await setLocalCanisterId(name, createdId);
    console.log(`[bootstrap] ${name} → ${createdId}`);
  }

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

  const evmRpcId = canisterId('evm_rpc');
  const solRpcId = canisterId('sol_rpc');
  const backendArgs = await fs.readFile(BACKEND_ARGS, 'utf8');
  const patchedBackendArgs = backendArgs
    .replace(/evmRpcCanisterId = "[^"]+"/, `evmRpcCanisterId = "${evmRpcId}"`)
    .replace(/solRpcCanisterId = "[^"]+"/, `solRpcCanisterId = "${solRpcId}"`);
  if (patchedBackendArgs !== backendArgs) {
    await fs.writeFile(BACKEND_ARGS, patchedBackendArgs);
    console.log(`[bootstrap] init-args/rabbithole-backend.did: evm_rpc → ${evmRpcId}, sol_rpc → ${solRpcId}`);
  }

  if (!canisterExists('internet_identity_backend')) {
    console.log('[bootstrap] creating internet_identity_backend on application subnet...');
    execSync(
      `icp canister create internet_identity_backend -e local --subnet ${appPrincipal} --cycles 20t`,
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

async function pocketIcJsonPost(url, body) {
  const payload = JSON.stringify(body, (_, value) =>
    typeof value === 'bigint' ? value.toString() : value,
  );

  for (let attempt = 1; attempt <= 120; attempt += 1) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
    });
    const text = await res.text();
    if (res.ok) return JSON.parse(text);

    if (res.status !== 409 || attempt === 120) {
      throw new Error(`${url} failed with HTTP ${res.status}: ${text}`);
    }

    await sleep(250);
  }

  throw new Error(`${url} failed after retries`);
}

async function pocketIcUpdateCall({
  baseUrl,
  instanceId,
  sender,
  canisterId,
  method,
  payload,
  effectiveSubnetId,
}) {
  const effective_principal = {
    SubnetId: base64EncodePrincipal(effectiveSubnetId),
  };
  const body = {
    sender: base64EncodePrincipal(sender),
    canister_id: base64EncodePrincipal(canisterId),
    method,
    payload: base64Encode(payload),
    effective_principal,
  };
  const submitted = await pocketIcJsonPost(
    `${baseUrl}/instances/${instanceId}/update/submit_ingress_message`,
    body,
  );
  const ok = unwrapPocketIcResult(submitted);
  const completed = await pocketIcJsonPost(
    `${baseUrl}/instances/${instanceId}/update/await_ingress_message`,
    {
      effective_principal,
      message_id: ok.message_id,
    },
  );
  return base64Decode(unwrapPocketIcResult(completed));
}

async function setLocalCanisterId(name, id) {
  await fs.mkdir(path.dirname(LOCAL_IDS_FILE), { recursive: true });
  let ids = {};
  try {
    ids = JSON.parse(await fs.readFile(LOCAL_IDS_FILE, 'utf8'));
  } catch {
    // File is created lazily for a fresh local project state.
  }
  ids[name] = id;
  await fs.writeFile(LOCAL_IDS_FILE, `${JSON.stringify(ids, null, 2)}\n`);
}

function unwrapPocketIcResult(response) {
  if ('Err' in response) {
    const err = response.Err;
    throw new Error(
      `PocketIC call failed: ${err.reject_message}. Reject code: ${err.reject_code}. Error code: ${err.error_code}. Certified: ${err.certified}`,
    );
  }
  return response.Ok;
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
    await sleep(1000);
  }
  throw new Error(`Timeout waiting for ${p}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error('[bootstrap] FAILED:', err.message);
  process.exit(1);
});
