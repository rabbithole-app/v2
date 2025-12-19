import { provideHttpClient } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  Provider,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { HttpAgentOptions } from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';
import { firstValueFrom } from 'rxjs';

import { environment } from '../environments/environment';
import { appRoutes } from './app.routes';
import { APP_DERIVATION_ORIGIN } from './core/constants';
import { ConfigService } from './core/services';
import { isCustomDomain } from './core/utils';
import {
  AUTH_CONFIG,
  AUTH_SERVICE,
  AuthConfig,
  DelegationAuthService,
} from '@rabbithole/auth';
import {
  APP_NAME_TOKEN,
  AUTH_MAX_TIME_TO_LIVE,
  CYCLES_MINTING_CANISTER_ID_TOKEN,
  ENCRYPTED_STORAGE_CANISTER_ID,
  FileSystemAccessService,
  HTTP_AGENT_OPTIONS_TOKEN,
  LEDGER_CANISTER_ID_TOKEN,
  MAIN_BACKEND_URL_TOKEN,
  MAIN_CANISTER_ID_TOKEN,
  provideCoreWorker,
} from '@rabbithole/core';

export const provideAuthService = (): Provider => ({
  provide: AUTH_SERVICE,
  useClass: DelegationAuthService,
});

const authConfig: AuthConfig = {
  appUrl: isDevMode() ? 'http://localhost:4200' : environment.appUrl,
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
    provideHttpClient(),
    provideAuthService(),
    provideAppInitializer(async () => {
      const configService = inject(ConfigService);
      const canisterId = await firstValueFrom(configService.init());
      configService.setCanisterId(canisterId);
    }),
    provideCoreWorker(),
    { provide: AUTH_CONFIG, useValue: authConfig },
    {
      provide: ENCRYPTED_STORAGE_CANISTER_ID,
      useFactory: () => {
        const configService = inject(ConfigService);
        return configService.canisterId();
      },
    },
    {
      provide: MAIN_CANISTER_ID_TOKEN,
      useValue: Principal.fromText(environment.backendCanisterId),
    },
    {
      provide: HTTP_AGENT_OPTIONS_TOKEN,
      useValue: {
        shouldFetchRootKey: !environment.production,
        ...(environment.production ? {} : { host: 'https://localhost' }),
      } satisfies HttpAgentOptions,
    },
    FileSystemAccessService,
    {
      provide: LEDGER_CANISTER_ID_TOKEN,
      useValue: Principal.fromText(environment.ledgerCanisterId),
    },
    {
      provide: CYCLES_MINTING_CANISTER_ID_TOKEN,
      useValue: Principal.fromText(environment.cyclesMintingCanisterId),
    },
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
  ],
};
