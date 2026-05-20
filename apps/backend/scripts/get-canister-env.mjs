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
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = resolve(__dirname, '..');

const CANISTERS = [
  'rabbithole-backend',
  'rabbithole-frontend',
  'internet_identity_backend',
  'internet_identity_frontend',
  'xrc',
  'sol_rpc',
  'evm_rpc',
];

const FRONTEND_ENV = {
  local: {
    PUBLIC_ENV_NAME: 'DEV',
    PUBLIC_HTTP_AGENT_HOST: 'http://localhost:8000',
    PUBLIC_EVM_RPC_URL: 'https://sepolia.base.org',
    PUBLIC_SOL_RPC_URL: 'https://api.devnet.solana.com',
    PUBLIC_BLOB_STORAGE_GATEWAY_URL: 'https://blob.caffeine.ai',
    PUBLIC_BLOB_STORAGE_CASHIER_CANISTER_ID: 'xc7sj-uyaaa-aaaaf-qbrja-cai',
    PUBLIC_ICPAY_PUBLISHABLE_KEY: 'pk_GP6RSrfGQTRWxw2QeBXThqOGuYcPak3E',
    PUBLIC_ICPAY_API_URL: 'https://api.betterstripe.com',
  },
  staging: {
    PUBLIC_ENV_NAME: 'STAGING',
    PUBLIC_HTTP_AGENT_HOST: 'https://icp-api.io',
    PUBLIC_EVM_RPC_URL: 'https://sepolia.base.org',
    PUBLIC_SOL_RPC_URL: 'https://api.devnet.solana.com',
    PUBLIC_BLOB_STORAGE_GATEWAY_URL: 'https://blob.caffeine.ai',
    PUBLIC_BLOB_STORAGE_CASHIER_CANISTER_ID: '72ch2-fiaaa-aaaar-qbsvq-cai',
    PUBLIC_ICPAY_PUBLISHABLE_KEY: 'pk_GP6RSrfGQTRWxw2QeBXThqOGuYcPak3E',
    PUBLIC_ICPAY_API_URL: 'https://api.betterstripe.com',
  },
  ic: {
    PUBLIC_ENV_NAME: 'PROD',
    PUBLIC_HTTP_AGENT_HOST: 'https://icp-api.io',
    PUBLIC_EVM_RPC_URL: 'https://mainnet.base.org',
    PUBLIC_SOL_RPC_URL: 'https://api.mainnet-beta.solana.com',
    PUBLIC_BLOB_STORAGE_GATEWAY_URL: 'https://blob.caffeine.ai',
    PUBLIC_BLOB_STORAGE_CASHIER_CANISTER_ID: '72ch2-fiaaa-aaaar-qbsvq-cai',
    PUBLIC_ICPAY_PUBLISHABLE_KEY: '',
    PUBLIC_ICPAY_API_URL: 'https://api.icpay.org',
  },
};

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

  const frontendEnv = FRONTEND_ENV[env] ?? FRONTEND_ENV.local;
  for (const [key, value] of Object.entries(frontendEnv)) {
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

function icp(args) {
  return execSync(`icp ${args}`, {
    cwd: BACKEND_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const env = process.argv[2] ?? process.env.ICP_ENVIRONMENT ?? 'local';
  console.log(JSON.stringify(getCanisterEnv(env), null, 2));
}
