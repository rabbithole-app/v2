import { safeGetCanisterEnv } from '@icp-sdk/core/agent/canister-env';
import { hexToBytes } from '@noble/hashes/utils';

declare module '@icp-sdk/core/agent/canister-env' {
  interface CanisterEnv {
    readonly PUBLIC_BLOB_STORAGE_CASHIER_CANISTER_ID: string;
    readonly PUBLIC_BLOB_STORAGE_GATEWAY_URL: string;
    readonly ['PUBLIC_CANISTER_ID:evm_rpc']: string;
    readonly ['PUBLIC_CANISTER_ID:internet_identity_backend']: string;
    readonly ['PUBLIC_CANISTER_ID:internet_identity_frontend']: string;
    readonly ['PUBLIC_CANISTER_ID:rabbithole-backend']: string;
    readonly ['PUBLIC_CANISTER_ID:rabbithole-frontend']: string;

    readonly ['PUBLIC_CANISTER_ID:sol_rpc']: string;
    readonly ['PUBLIC_CANISTER_ID:xrc']: string;
    readonly PUBLIC_ENV_NAME: string;
    readonly PUBLIC_EVM_RPC_URL: string;
    readonly PUBLIC_HTTP_AGENT_HOST: string;
    readonly PUBLIC_ICPAY_API_URL: string;
    readonly PUBLIC_ICPAY_PUBLISHABLE_KEY: string;
    readonly PUBLIC_SOL_RPC_URL: string;
    readonly PUBLIC_STORAGE_LICENSE_INCLUDED_BYTES: string;
    readonly PUBLIC_STORAGE_LICENSE_MAX_FILE_BYTES: string;
  }
}

declare const __RABBITHOLE_CANISTER_ENV__: Record<string, string> | undefined;

const env = safeGetCanisterEnv() ?? getInjectedCanisterEnv();

export function mustGetCanisterEnvValue(key: keyof NonNullable<typeof env>): string {
  const value = env?.[key];
  if (!value) {
    throw new Error(
      `ic_env cookie is missing "${String(key)}". ` +
        'Start the backend stack (`npx nx serve backend`) so the dev server can fetch canister IDs.',
    );
  }
  return value as string;
}

function getInjectedCanisterEnv(): NonNullable<ReturnType<typeof safeGetCanisterEnv>> | undefined {
  if (typeof __RABBITHOLE_CANISTER_ENV__ === 'undefined') {
    return undefined;
  }

  const { ic_root_key, ...values } = __RABBITHOLE_CANISTER_ENV__;
  return {
    ...values,
    ...(ic_root_key ? { IC_ROOT_KEY: hexToBytes(ic_root_key) } : {}),
  } as NonNullable<ReturnType<typeof safeGetCanisterEnv>>;
}

function getOptional(key: keyof NonNullable<typeof env>): string | undefined {
  return env?.[key] as string | undefined;
}

export const BACKEND_CANISTER_ID = getOptional('PUBLIC_CANISTER_ID:rabbithole-backend') ?? '';
export const FRONTEND_CANISTER_ID = getOptional('PUBLIC_CANISTER_ID:rabbithole-frontend') ?? '';
export const BLOB_STORAGE_GATEWAY_URL = getOptional('PUBLIC_BLOB_STORAGE_GATEWAY_URL') ?? '';
export const BLOB_STORAGE_CASHIER_CANISTER_ID = getOptional('PUBLIC_BLOB_STORAGE_CASHIER_CANISTER_ID') ?? '';
export const ENV_NAME = getOptional('PUBLIC_ENV_NAME') ?? '';
export const HTTP_AGENT_HOST = getOptional('PUBLIC_HTTP_AGENT_HOST') ?? '';
export const EVM_RPC_URL = getOptional('PUBLIC_EVM_RPC_URL') ?? '';
export const SOL_RPC_URL = getOptional('PUBLIC_SOL_RPC_URL') ?? '';
export const ICPAY_PUBLISHABLE_KEY = getOptional('PUBLIC_ICPAY_PUBLISHABLE_KEY') ?? '';
export const ICPAY_API_URL = getOptional('PUBLIC_ICPAY_API_URL') ?? '';
export const DEFAULT_STORAGE_LICENSE_INCLUDED_BYTES = 5_368_709_120n;
export const DEFAULT_STORAGE_LICENSE_MAX_FILE_BYTES = 2_147_483_648n;
export const STORAGE_LICENSE_INCLUDED_BYTES =
  getOptionalNat('PUBLIC_STORAGE_LICENSE_INCLUDED_BYTES') ??
  DEFAULT_STORAGE_LICENSE_INCLUDED_BYTES;
export const STORAGE_LICENSE_MAX_FILE_BYTES =
  getOptionalNat('PUBLIC_STORAGE_LICENSE_MAX_FILE_BYTES') ??
  DEFAULT_STORAGE_LICENSE_MAX_FILE_BYTES;

export const INTERNET_IDENTITY_BACKEND_CANISTER_ID = getOptional('PUBLIC_CANISTER_ID:internet_identity_backend');
export const INTERNET_IDENTITY_FRONTEND_CANISTER_ID = getOptional('PUBLIC_CANISTER_ID:internet_identity_frontend');
export const XRC_CANISTER_ID = getOptional('PUBLIC_CANISTER_ID:xrc');
export const SOL_RPC_CANISTER_ID = getOptional('PUBLIC_CANISTER_ID:sol_rpc');
export const EVM_RPC_CANISTER_ID = getOptional('PUBLIC_CANISTER_ID:evm_rpc');

export const IC_ROOT_KEY: Uint8Array | undefined = env?.IC_ROOT_KEY;

function getOptionalNat(
  key: keyof NonNullable<typeof env>,
): bigint | undefined {
  const value = getOptional(key);
  if (!value) return undefined;

  try {
    const parsed = BigInt(value);
    return parsed >= 0n ? parsed : undefined;
  } catch {
    return undefined;
  }
}
