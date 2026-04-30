import { provideHttpClient } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  Provider,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { HttpAgentOptions } from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';
import { createInjectionToken } from 'ngxtension/create-injection-token';
import { firstValueFrom } from 'rxjs';

import {
  AUTH_CONFIG,
  AUTH_SERVICE,
  AuthConfig,
  DelegationAuthService,
} from '@rabbithole/auth';
import {
  APP_NAME_TOKEN,
  ACCOUNT_MENU_BACKEND_LINKS_ENABLED_TOKEN,
  AUTH_MAX_TIME_TO_LIVE,
  BACKEND_FEATURES_ENABLED_TOKEN,
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
  provideCoreWorker,
  SIDEBAR_SUBSCRIPTION_LINK_TOKEN,
} from '@rabbithole/core';

import { appRoutes } from './app.routes';
import { ConfigService } from './core/services';

const MANAGEMENT_CANISTER_ID = Principal.fromText('aaaaa-aa');

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
      Principal.fromText(runtimeConfig.backendCanisterId),
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
    provideRouter(appRoutes, withComponentInputBinding()),
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
      provide: MAIN_CANISTER_ID_TOKEN,
      useFactory: () => Principal.fromText(injectStorageRuntimeConfig().backendCanisterId),
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
      provide: SIDEBAR_SUBSCRIPTION_LINK_TOKEN,
      useValue: null,
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
