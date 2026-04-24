import { provideHttpClient } from '@angular/common/http';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  Provider,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { HttpAgentOptions } from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';
import { isTauri } from '@tauri-apps/api/core';

import {
  AUTH_CONFIG,
  AUTH_SERVICE,
  AuthConfig,
  AuthService,
} from '@rabbithole/auth';
import { TauriNativeAuthService } from '@rabbithole/auth/tauri';
import {
  APP_NAME_TOKEN,
  AUTH_MAX_TIME_TO_LIVE,
  BLOB_STORAGE_CONFIG_TOKEN,
  FileSystemAccessService,
  HTTP_AGENT_OPTIONS_TOKEN,
  IC_ROOT_KEY,
  ICPAY_CONFIG_TOKEN,
  IS_PRODUCTION_TOKEN,
  MAIN_BACKEND_URL_TOKEN,
  MAIN_CANISTER_ID_TOKEN,
  MULTI_CHAIN_RPC_CONFIG_TOKEN,
  provideCoreWorker,
  provideIcAuthSignOutHandler,
  provideReferralCapture,
  provideRegistration,
} from '@rabbithole/core';

import { environment } from '../environments/environment';
import { appRoutes } from './app.routes';
import { APP_DERIVATION_ORIGIN } from './core/constants';
import { isCustomDomain } from './core/utils';

export const provideAuthService = (): Provider => ({
  provide: AUTH_SERVICE,
  useClass: isTauri() ? TauriNativeAuthService : AuthService,
});

const authConfig: AuthConfig = {
  appUrl: environment.appUrl,
  scheme: environment.scheme,
  delegationPath: '/delegation',
  loginOptions: {
    identityProvider: environment.identityProviderUrl,
    maxTimeToLive: AUTH_MAX_TIME_TO_LIVE,
    ...(isCustomDomain() && {
      derivationOrigin: APP_DERIVATION_ORIGIN,
    }),
  },
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideReferralCapture(),
    provideIcAuthSignOutHandler(),
    provideRegistration(),
    provideRouter(appRoutes, withComponentInputBinding()),
    provideHttpClient(),
    provideAuthService(),
    { provide: AUTH_CONFIG, useValue: authConfig },
    {
      provide: MAIN_CANISTER_ID_TOKEN,
      useValue: Principal.fromText(environment.backendCanisterId),
    },
    provideCoreWorker(),
    {
      provide: HTTP_AGENT_OPTIONS_TOKEN,
      useValue: {
        rootKey: IC_ROOT_KEY,
        host: environment.httpAgentHost,
      } satisfies HttpAgentOptions,
    },
    {
      provide: BLOB_STORAGE_CONFIG_TOKEN,
      useValue: {
        gatewayUrl: environment.blobStorageGatewayUrl,
        cashierCanisterId: environment.blobStorageCashierCanisterId,
      },
    },
    FileSystemAccessService,
    {
      provide: MAIN_BACKEND_URL_TOKEN,
      useValue: environment.production
        ? `https://${environment.backendCanisterId}.icp0.io`
        : `https://${environment.backendCanisterId}.localhost`,
    },
    {
      provide: APP_NAME_TOKEN,
      useValue: environment.appName,
    },
    {
      provide: IS_PRODUCTION_TOKEN,
      useValue: environment.production,
    },
    {
      provide: ICPAY_CONFIG_TOKEN,
      useValue: environment.icpay,
    },
    {
      provide: MULTI_CHAIN_RPC_CONFIG_TOKEN,
      useValue: {
        evmRpcUrl: environment.evmRpcUrl,
        solanaRpcUrl: environment.solanaRpcUrl,
      },
    },
  ],
};
