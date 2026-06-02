import { provideHttpClient } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  Provider,
  provideZonelessChangeDetection,
} from '@angular/core';
import {
  PreloadAllModules,
  provideRouter,
  withComponentInputBinding,
  withPreloading,
} from '@angular/router';
import { HttpAgentOptions } from '@icp-sdk/core/agent';
import { createInjectionToken } from 'ngxtension/create-injection-token';
import { firstValueFrom } from 'rxjs';

import {
  AUTH_CONFIG,
  AUTH_SERVICE,
  AuthConfig,
  DelegationAuthService,
} from '@rabbithole/auth';
import {
  ACCOUNT_MENU_BACKEND_LINKS_ENABLED_TOKEN,
  APP_NAME_TOKEN,
  AUTH_MAX_TIME_TO_LIVE,
  BACKEND_FEATURES_ENABLED_TOKEN,
  BLOB_STORAGE_CONFIG_TOKEN,
  canisterOrigin,
  ENCRYPTED_STORAGE_BACKEND_TYPE_TOKEN,
  ENCRYPTED_STORAGE_CANISTER_ID,
  FileSystemAccessService,
  HTTP_AGENT_OPTIONS_TOKEN,
  IC_ROOT_KEY,
  IS_PRODUCTION_TOKEN,
  MAIN_BACKEND_URL_TOKEN,
  MAIN_CANISTER_ID_TOKEN,
  MULTI_CHAIN_RPC_CONFIG_TOKEN,
  principalFromConfig,
  provideCoreWorker,
} from '@rabbithole/core/app-runtime';

import { environment } from '../environments/environment';
import { appRoutes } from './app.routes';
import { ConfigService } from './core/services/config.service';

const MANAGEMENT_CANISTER_ID = principalFromConfig(
  'aaaaa-aa',
  'IC management canister',
);

export const provideAuthService = (): Provider => ({
  provide: AUTH_SERVICE,
  useClass: DelegationAuthService,
});

const [injectStorageRuntimeConfig, provideStorageRuntimeConfig] =
  createInjectionToken(() => inject(ConfigService).runtimeConfig(), {
    isRoot: false,
  });

function storageAuthConfig(): AuthConfig {
  const runtimeConfig = injectStorageRuntimeConfig();

  return {
    appUrl: runtimeConfig.appUrl,
    scheme: runtimeConfig.scheme,
    delegationPath: '/delegation',
    delegationTargets: [
      runtimeConfig.canisterId,
      principalFromConfig(
        runtimeConfig.backendCanisterId,
        'storage.runtimeConfig.backendCanisterId',
      ),
      MANAGEMENT_CANISTER_ID,
    ],
    loginOptions: {
      identityProvider: runtimeConfig.identityProviderUrl,
      maxTimeToLive: AUTH_MAX_TIME_TO_LIVE,
    },
    openIdProviders: [...runtimeConfig.openIdProviders],
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      appRoutes,
      withComponentInputBinding(),
      withPreloading(PreloadAllModules),
    ),
    provideHttpClient(),
    provideAuthService(),
    provideAppInitializer(async () => {
      const configService = inject(ConfigService);
      const runtimeConfig = await firstValueFrom(configService.init());
      configService.setRuntimeConfig(runtimeConfig);
    }),
    provideCoreWorker(),
    provideStorageRuntimeConfig(),
    { provide: AUTH_CONFIG, useFactory: storageAuthConfig },
    {
      provide: ENCRYPTED_STORAGE_CANISTER_ID,
      useFactory: () => injectStorageRuntimeConfig().canisterId,
    },
    {
      provide: ENCRYPTED_STORAGE_BACKEND_TYPE_TOKEN,
      useFactory: () => injectStorageRuntimeConfig().storageBackendType,
    },
    {
      provide: BLOB_STORAGE_CONFIG_TOKEN,
      useValue: {
        gatewayUrl: environment.blobStorageGatewayUrl,
        cashierCanisterId: environment.blobStorageCashierCanisterId,
      },
    },
    {
      provide: MAIN_CANISTER_ID_TOKEN,
      useFactory: () =>
        principalFromConfig(
          injectStorageRuntimeConfig().backendCanisterId,
          'storage.runtimeConfig.backendCanisterId',
        ),
    },
    {
      provide: HTTP_AGENT_OPTIONS_TOKEN,
      useFactory: () => {
        const runtimeConfig = injectStorageRuntimeConfig();
        return {
          rootKey: IC_ROOT_KEY,
          host: runtimeConfig.httpAgentHost,
          shouldFetchRootKey: runtimeConfig.shouldFetchRootKey,
        } satisfies HttpAgentOptions;
      },
    },
    FileSystemAccessService,
    {
      provide: MAIN_BACKEND_URL_TOKEN,
      useFactory: () => {
        const runtimeConfig = injectStorageRuntimeConfig();
        return canisterOrigin(runtimeConfig.backendCanisterId, runtimeConfig.httpAgentHost);
      },
    },
    {
      provide: APP_NAME_TOKEN,
      useFactory: () => injectStorageRuntimeConfig().appName,
    },
    {
      provide: IS_PRODUCTION_TOKEN,
      useFactory: () => injectStorageRuntimeConfig().production,
    },
    {
      provide: BACKEND_FEATURES_ENABLED_TOKEN,
      useValue: true,
    },
    {
      provide: ACCOUNT_MENU_BACKEND_LINKS_ENABLED_TOKEN,
      useValue: false,
    },
    {
      provide: MULTI_CHAIN_RPC_CONFIG_TOKEN,
      useFactory: () => {
        const runtimeConfig = injectStorageRuntimeConfig();
        return {
          evmRpcUrl: runtimeConfig.evmRpcUrl,
          solanaRpcUrl: runtimeConfig.solanaRpcUrl,
        };
      },
    },
  ],
};
