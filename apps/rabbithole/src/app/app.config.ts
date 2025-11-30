import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  Provider,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { HttpAgentOptions } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { isTauri } from '@tauri-apps/api/core';

import { environment } from '../environments/environment';
import { appRoutes } from './app.routes';
import { APP_DERIVATION_ORIGIN, AUTH_MAX_TIME_TO_LIVE } from './core/constants';
import { provideMainActor } from '@rabbithole/core';
import { isCustomDomain } from './core/utils';
import {
  AUTH_CONFIG,
  AUTH_SERVICE,
  AuthConfig,
  AuthService,
} from '@rabbithole/auth';
import { TauriDeepLinkAuthService } from '@rabbithole/auth/tauri';
import {
  FileSystemAccessService,
  HTTP_AGENT_OPTIONS_TOKEN,
  MAIN_CANISTER_ID,
} from '@rabbithole/core';

export const provideAuthService = (): Provider => ({
  provide: AUTH_SERVICE,
  useClass: isTauri() ? TauriDeepLinkAuthService : AuthService,
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
    provideRouter(appRoutes, withComponentInputBinding()),
    provideAuthService(),
    { provide: AUTH_CONFIG, useValue: authConfig },
    {
      provide: MAIN_CANISTER_ID,
      useValue: Principal.fromText(environment.backendCanisterId),
    },
    provideMainActor(),
    {
      provide: HTTP_AGENT_OPTIONS_TOKEN,
      useValue: {
        shouldFetchRootKey: !environment.production,
        host: 'https://localhost',
      } satisfies HttpAgentOptions,
    },
    FileSystemAccessService,
  ],
};
