#!/usr/bin/env node
// Queries icp-cli for current canister IDs and network root-key, then produces
// everything the rspack dev server needs to serve the `ic_env` cookie to the
// frontend (mimicking what the asset canister does in production).
//
// Usage:
//   import { getCanisterEnv } from './get-canister-env.mjs';
//   const env = getCanisterEnv('local');
//
// CLI: `node get-canister-env.mjs [env]` prints JSON.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = resolve(__dirname, '..');
const ICP_YAML_PATH = resolve(BACKEND_DIR, 'icp.yaml');
const BACKEND_CANISTER_NAME = 'rabbithole-backend';
const FRONTEND_CANISTER_NAME = 'rabbithole-frontend';

const BACKEND_PUBLIC_ENV_MAPPINGS = {
  STORAGE_LICENSE_INCLUDED_BYTES: 'PUBLIC_STORAGE_LICENSE_INCLUDED_BYTES',
  STORAGE_LICENSE_MAX_FILE_BYTES: 'PUBLIC_STORAGE_LICENSE_MAX_FILE_BYTES',
};

const CANISTERS = [
  BACKEND_CANISTER_NAME,
  FRONTEND_CANISTER_NAME,
  'internet_identity_backend',
  'internet_identity_frontend',
  'xrc',
  'sol_rpc',
  'evm_rpc',
];

export function getCanisterEnv(env = 'local') {
  const networkStatus = JSON.parse(icp(`network status -e ${env} --json`));
  const rootKey = networkStatus.root_key;
  const apiUrl = networkStatus.api_url;

  const canisterIds = {};
  const envVars = {};
  const cookieParts = [];

  for (const name of CANISTERS) {
    const id = canisterId(name, env);
    if (!id) continue;
    canisterIds[name] = id;
    envVars[`PUBLIC_CANISTER_ID:${name}`] = id;
  }

  const publicEnv = {
    ...readBackendPublicEnvironment(env),
    ...readFrontendEnvironment(env),
  };
  for (const [key, value] of Object.entries(publicEnv)) {
    envVars[key] = value;
  }

  envVars.ic_root_key = rootKey;
  for (const [key, value] of Object.entries(envVars)) {
    cookieParts.push(`${key}=${value}`);
  }

  return {
    canisterIds,
    envVars,
    rootKey,
    apiUrl,
    cookieValue: cookieParts.join('&'),
  };
}

function canisterId(name, env) {
  try {
    return icp(`canister status ${name} -e ${env} -i`);
  } catch {
    return null;
  }
}

function environmentVariablesToRecord(items) {
  const result = {};

  for (const item of items ?? []) {
    if (
      item &&
      typeof item.name === 'string' &&
      typeof item.value === 'string'
    ) {
      result[item.name] = item.value;
    }
  }

  return result;
}

function findNamed(items, name) {
  return items?.find(
    (item) => item && typeof item === 'object' && item.name === name,
  );
}

function icp(args) {
  return execSync(`icp ${args}`, {
    cwd: BACKEND_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function readBackendPublicEnvironment(env) {
  try {
    const status = JSON.parse(
      icp(`canister status ${BACKEND_CANISTER_NAME} -e ${env} --json`),
    );
    const backendEnv = environmentVariablesToRecord(
      status?.settings?.environment_variables,
    );
    const publicEnv = {};

    for (const [backendName, publicName] of Object.entries(
      BACKEND_PUBLIC_ENV_MAPPINGS,
    )) {
      const value = backendEnv[backendName];
      if (typeof value === 'string' && value.length > 0) {
        publicEnv[publicName] = value;
      }
    }

    return publicEnv;
  } catch {
    return {};
  }
}

function readFrontendEnvironment(env) {
  const config = YAML.parse(readFileSync(ICP_YAML_PATH, 'utf8'));
  const frontendCanister = findNamed(config.canisters, FRONTEND_CANISTER_NAME);
  const base = frontendCanister?.settings?.environment_variables ?? {};
  const environment = findNamed(config.environments, env);
  const override =
    environment?.settings?.[FRONTEND_CANISTER_NAME]?.environment_variables ??
    {};
  return { ...base, ...override };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const env = process.argv[2] ?? process.env.ICP_ENVIRONMENT ?? 'local';
  console.log(JSON.stringify(getCanisterEnv(env), null, 2));
}
