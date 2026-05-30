import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, isDevMode, signal } from '@angular/core';
import { Principal } from '@icp-sdk/core/principal';
import { catchError, map, of, retry } from 'rxjs';

import { AuthConfig } from '@rabbithole/auth';
import { canisterUrl, principalFromConfig } from '@rabbithole/core/app-runtime';

import { environment } from '../../../environments/environment';
import { DevStorageCanisterIdService } from './dev-storage-canister-id.service';

export type StorageRuntimeConfig = {
  appName: string;
  appUrl: string;
  backendCanisterId: string;
  canisterId: Principal;
  envName: string;
  evmRpcUrl: string;
  httpAgentHost: string;
  identityProviderUrl: string;
  openIdProviders: NonNullable<AuthConfig['openIdProviders']>;
  production: boolean;
  scheme: string;
  shouldFetchRootKey: boolean;
  solanaRpcUrl: string;
  storageBackendType: 'BlobStorage' | 'OnChain';
};

type StorageInfoJson = {
  canisterId: string;
  internetIdentityFrontendCanisterId?: string;
  rabbitholeBackendCanisterId?: string;
  rabbitholeFrontendCanisterId?: string;
  storageBackendType: 'BlobStorage' | 'OnChain';
};

@Injectable({ providedIn: 'root' })
export class ConfigService {
  readonly #runtimeConfig = signal<StorageRuntimeConfig | null>(null);
  readonly runtimeConfig = computed(() => {
    const config = this.#runtimeConfig();
    if (!config) {
      throw new Error(
        'Storage runtime config not initialized. Ensure init() is called before accessing config.',
      );
    }
    return config;
  });
  readonly canisterId = computed(() => {
    return this.runtimeConfig().canisterId;
  });
  #devCanisterId = inject(DevStorageCanisterIdService);
  #httpClient = inject(HttpClient);

  init() {
    const devCanisterId = isDevMode() ? this.#devCanisterId.resolve() : null;
    if (devCanisterId) {
      return this.#httpClient
        .get<StorageInfoJson>(`https://${devCanisterId.toText()}.localhost/info.json`)
        .pipe(
          retry(3),
          map((info) => this.#fromInfoJson(info)),
          catchError(() => of(this.#fromEnvironment(devCanisterId))),
        );
    }

    return this.#httpClient
      .get<StorageInfoJson>('/info.json')
      .pipe(
        retry(3),
        map((info) => this.#fromInfoJson(info)),
      );
  }

  setRuntimeConfig(config: StorageRuntimeConfig) {
    this.#runtimeConfig.set(config);
  }

  #buildConfig(
    config: Omit<
      StorageRuntimeConfig,
      'appName' | 'production' | 'scheme' | 'shouldFetchRootKey'
    >,
  ): StorageRuntimeConfig {
    const envName = this.#require(config.envName, 'envName');
    const httpAgentHost = this.#require(config.httpAgentHost, 'httpAgentHost');

    return {
      ...config,
      appName: environment.appName,
      appUrl: this.#require(config.appUrl, 'appUrl'),
      backendCanisterId: this.#require(config.backendCanisterId, 'backendCanisterId'),
      envName,
      evmRpcUrl: this.#require(config.evmRpcUrl, 'evmRpcUrl'),
      httpAgentHost,
      production: environment.production && envName === 'PROD',
      scheme: environment.scheme,
      shouldFetchRootKey: envName === 'DEV' || new URL(httpAgentHost).hostname.endsWith('localhost'),
      solanaRpcUrl: this.#require(config.solanaRpcUrl, 'solanaRpcUrl'),
    };
  }

  #fromEnvironment(canisterId: Principal): StorageRuntimeConfig {
    return this.#buildConfig({
      backendCanisterId: environment.backendCanisterId,
      canisterId,
      envName: environment.envName,
      evmRpcUrl: environment.evmRpcUrl,
      httpAgentHost: environment.httpAgentHost,
      identityProviderUrl: environment.identityProviderUrl,
      openIdProviders: [...environment.openIdProviders],
      solanaRpcUrl: environment.solanaRpcUrl,
      storageBackendType: 'BlobStorage',
      appUrl: environment.appUrl,
    });
  }

  #fromInfoJson(info: StorageInfoJson): StorageRuntimeConfig {
    const canisterId = principalFromConfig(
      info.canisterId,
      'storage.infoJson.canisterId',
    );
    const isLocalHost =
      location.hostname === 'localhost' || location.hostname.endsWith('.localhost');
    const envName = isLocalHost ? 'DEV' : environment.envName;
    const httpAgentHost = isLocalHost ? 'https://localhost' : environment.httpAgentHost;
    const identityProviderUrl =
      envName === 'DEV' && info.internetIdentityFrontendCanisterId
        ? canisterUrl(info.internetIdentityFrontendCanisterId, httpAgentHost, '/authorize')
        : environment.identityProviderUrl;
    const openIdProviders =
      envName === 'DEV'
        ? [
            {
              id: 'dev',
              icon: 'hugeDeveloper',
              issuer: 'https://openid.localhost',
              label: 'Continue with Dev OpenID',
            },
          ] satisfies NonNullable<AuthConfig['openIdProviders']>
        : [...environment.openIdProviders];

    const appUrl =
      envName === 'STAGING' && info.rabbitholeFrontendCanisterId
        ? canisterUrl(info.rabbitholeFrontendCanisterId, httpAgentHost)
        : environment.appUrl;

    return this.#buildConfig({
      appUrl,
      backendCanisterId: info.rabbitholeBackendCanisterId || environment.backendCanisterId,
      canisterId,
      envName,
      evmRpcUrl: environment.evmRpcUrl,
      httpAgentHost,
      identityProviderUrl,
      openIdProviders,
      solanaRpcUrl: environment.solanaRpcUrl,
      storageBackendType: info.storageBackendType,
    });
  }

  #require(value: string | undefined, key: string): string {
    if (!value) {
      throw new Error(`Storage runtime config is missing "${key}".`);
    }
    return value;
  }
}
