import { InjectionToken } from '@angular/core';

export const MAIN_BACKEND_URL_TOKEN = new InjectionToken<string>(
  'MAIN_BACKEND_URL_TOKEN',
);

export const APP_NAME_TOKEN = new InjectionToken<string>('APP_NAME_TOKEN');

export const IS_PRODUCTION_TOKEN = new InjectionToken<boolean>(
  'IS_PRODUCTION_TOKEN',
);

export interface MultiChainRpcConfig {
  evmRpcUrl: string;
  solanaRpcUrl: string;
}

export const MULTI_CHAIN_RPC_CONFIG_TOKEN =
  new InjectionToken<MultiChainRpcConfig>('MULTI_CHAIN_RPC_CONFIG_TOKEN');

export interface BlobStorageConfig {
  cashierCanisterId: string;
  gatewayUrl: string;
}

export const BLOB_STORAGE_CONFIG_TOKEN = new InjectionToken<BlobStorageConfig>(
  'BLOB_STORAGE_CONFIG_TOKEN',
);

export type EncryptedStorageBackendType = 'BlobStorage' | 'OnChain';

export const ENCRYPTED_STORAGE_BACKEND_TYPE_TOKEN =
  new InjectionToken<EncryptedStorageBackendType>('ENCRYPTED_STORAGE_BACKEND_TYPE_TOKEN');

import type { PayButtonConfig } from '@ic-pay/icpay-widget';

export type IcpayConfig = Partial<PayButtonConfig> & Pick<PayButtonConfig, 'apiUrl' | 'publishableKey'>;

export const ICPAY_CONFIG_TOKEN = new InjectionToken<IcpayConfig>(
  'ICPAY_CONFIG_TOKEN',
);
