import { safeGetCanisterEnv } from '@icp-sdk/core/agent/canister-env';

declare module '@icp-sdk/core/agent/canister-env' {
  interface CanisterEnv {
    readonly ['PUBLIC_CANISTER_ID:rabbithole-backend']: string;
    readonly ['PUBLIC_CANISTER_ID:rabbithole-frontend']: string;
    readonly ['PUBLIC_CANISTER_ID:internet_identity_backend']: string;
    readonly ['PUBLIC_CANISTER_ID:internet_identity_frontend']: string;
    readonly ['PUBLIC_CANISTER_ID:xrc']: string;
    readonly ['PUBLIC_CANISTER_ID:sol_rpc']: string;
    readonly ['PUBLIC_CANISTER_ID:evm_rpc']: string;

    readonly PUBLIC_BLOB_STORAGE_GATEWAY_URL: string;
    readonly PUBLIC_BLOB_STORAGE_CASHIER_CANISTER_ID: string;
    readonly PUBLIC_ENV_NAME: string;
    readonly PUBLIC_HTTP_AGENT_HOST: string;
    readonly PUBLIC_EVM_RPC_URL: string;
    readonly PUBLIC_SOL_RPC_URL: string;
    readonly PUBLIC_ICPAY_PUBLISHABLE_KEY: string;
    readonly PUBLIC_ICPAY_API_URL: string;
  }
}

const env = safeGetCanisterEnv();

function mustGet(key: keyof NonNullable<typeof env>): string {
  const value = env?.[key];
  if (!value) {
    throw new Error(
      `ic_env cookie is missing "${String(key)}". ` +
        'Start the backend stack (`npx nx serve backend`) so the dev server can fetch canister IDs.',
    );
  }
  return value as string;
}

function getOptional(key: keyof NonNullable<typeof env>): string | undefined {
  return env?.[key] as string | undefined;
}

export const BACKEND_CANISTER_ID = mustGet('PUBLIC_CANISTER_ID:rabbithole-backend');
export const FRONTEND_CANISTER_ID = mustGet('PUBLIC_CANISTER_ID:rabbithole-frontend');
export const BLOB_STORAGE_GATEWAY_URL = mustGet('PUBLIC_BLOB_STORAGE_GATEWAY_URL');
export const BLOB_STORAGE_CASHIER_CANISTER_ID = mustGet('PUBLIC_BLOB_STORAGE_CASHIER_CANISTER_ID');
export const ENV_NAME = mustGet('PUBLIC_ENV_NAME');
export const HTTP_AGENT_HOST = mustGet('PUBLIC_HTTP_AGENT_HOST');
export const EVM_RPC_URL = mustGet('PUBLIC_EVM_RPC_URL');
export const SOL_RPC_URL = mustGet('PUBLIC_SOL_RPC_URL');
export const ICPAY_PUBLISHABLE_KEY = mustGet('PUBLIC_ICPAY_PUBLISHABLE_KEY');
export const ICPAY_API_URL = mustGet('PUBLIC_ICPAY_API_URL');

export const INTERNET_IDENTITY_BACKEND_CANISTER_ID = getOptional('PUBLIC_CANISTER_ID:internet_identity_backend');
export const INTERNET_IDENTITY_FRONTEND_CANISTER_ID = getOptional('PUBLIC_CANISTER_ID:internet_identity_frontend');
export const XRC_CANISTER_ID = getOptional('PUBLIC_CANISTER_ID:xrc');
export const SOL_RPC_CANISTER_ID = getOptional('PUBLIC_CANISTER_ID:sol_rpc');
export const EVM_RPC_CANISTER_ID = getOptional('PUBLIC_CANISTER_ID:evm_rpc');

export const IC_ROOT_KEY: Uint8Array | undefined = env?.IC_ROOT_KEY;
