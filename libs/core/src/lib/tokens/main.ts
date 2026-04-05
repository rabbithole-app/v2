import { InjectionToken } from '@angular/core';

export const MAIN_BACKEND_URL_TOKEN = new InjectionToken<string>(
  'MAIN_BACKEND_URL_TOKEN',
);

export const APP_NAME_TOKEN = new InjectionToken<string>('APP_NAME_TOKEN');

export const IS_PRODUCTION_TOKEN = new InjectionToken<boolean>(
  'IS_PRODUCTION_TOKEN',
);

export interface BlobStorageConfig {
  gatewayUrl: string;
  cashierCanisterId: string;
}

export const BLOB_STORAGE_CONFIG_TOKEN = new InjectionToken<BlobStorageConfig>(
  'BLOB_STORAGE_CONFIG_TOKEN',
);
