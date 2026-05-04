import { computed, inject, Injectable, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import {
  AuthClient,
  AuthClientCreateOptions,
  AuthClientSignInOptions,
  SignedAttributes,
} from '@icp-sdk/auth/client';
import { AnonymousIdentity, Identity } from '@icp-sdk/core/agent';
import { map } from 'rxjs';

import { assertClient } from './asserts';
import {
  AUTH_CONFIG,
  AUTH_IDENTITY_ATTRIBUTES_PROVIDER,
  AuthClientLogoutOptions,
  AuthConfig,
  AuthSessionEvent,
  AuthSignInOptions,
  IdentityAttributesProvider,
  SignedIdentityAttributes,
} from './tokens';

interface State {
  client: AuthClient | null;
  identity: Identity;
  isAuthenticated: boolean;
  lastAuthEvent: AuthSessionEvent | null;
  ready: boolean;
}

const INITIAL_VALUE: State = {
  client: null,
  identity: new AnonymousIdentity(),
  isAuthenticated: false,
  lastAuthEvent: null,
  ready: false,
};

@Injectable({ providedIn: 'root' })
export class BrokerAuthService {
  #state = signal(INITIAL_VALUE);
  identity = computed(() => this.#state().identity);
  isAuthenticated = computed(() => this.#state().isAuthenticated);
  lastAuthEvent = computed(() => this.#state().lastAuthEvent);
  principalId = computed(() => this.#state().identity.getPrincipal().toText());
  ready$ = toObservable(this.#state).pipe(map(({ ready }) => ready));
  #authConfig = inject(AUTH_CONFIG);
  #identityAttributesProvider = inject(AUTH_IDENTITY_ATTRIBUTES_PROVIDER, {
    optional: true,
  });
  #authEventId = 0;

  constructor() {
    this.#initState();
  }

  async requestAttributes(params: {
    keys: string[];
    nonce: Uint8Array;
  }): Promise<SignedAttributes> {
    const { client } = this.#state();
    assertClient(client);
    return client.requestAttributes(params);
  }

  async signIn(options: AuthSignInOptions = {}) {
    const client = this.#createClient(this.#authConfig, options);
    this.#state.update((state) => ({ ...state, client }));

    const authEvent = this.#createAuthEvent(options);
    const signedAttributesPromise = this.#requestSignInAttributes(
      client,
      authEvent,
      this.#identityAttributesProvider,
    );

    await client.signIn(getSignInOptions(this.#authConfig.loginOptions));
    const identityAttributes = await signedAttributesPromise;
    await this.#refreshState(client, {
      ...authEvent,
      ...(identityAttributes && { identityAttributes }),
    });
  }

  #createAuthEvent(options: AuthSignInOptions): AuthSessionEvent {
    return {
      hasAttributes:
        options.openIdProvider != null ||
        options.openIdIssuer != null ||
        options.ssoDomain != null,
      id: ++this.#authEventId,
      openIdIssuer: options.openIdIssuer,
      openIdProvider: options.openIdProvider,
      ssoDomain: options.ssoDomain,
    };
  }

  async #requestSignInAttributes(
    client: AuthClient,
    authEvent: AuthSessionEvent,
    provider: IdentityAttributesProvider | null,
  ): Promise<SignedIdentityAttributes | null> {
    if (!authEvent.hasAttributes || !provider) return null;

    try {
      const request = await provider(authEvent);
      if (!request || request.keys.length === 0) return null;
      const attributes = await client.requestAttributes({
        keys: request.keys,
        nonce: request.nonce,
      });
      return { ...request, attributes };
    } catch {
      return null;
    }
  }

  async signOut(opts?: AuthClientLogoutOptions) {
    const { client } = this.#state();
    assertClient(client);

    await client.logout(opts);
    await this.#initState({ clearAuthEvent: true });
  }

  #createClient(config: AuthConfig, options: AuthSignInOptions = {}) {
    return new AuthClient({
      ...getCreateOptions(config.loginOptions),
      openIdProvider: options.openIdProvider,
      ...((options.openIdIssuer || options.ssoDomain) && {
        identityProvider: identityProviderWithAttributeProvider(
          config.loginOptions?.identityProvider,
          options.ssoDomain
            ? { key: 'sso', value: options.ssoDomain }
            : { key: 'openid', value: options.openIdIssuer ?? '' },
        ),
      }),
    });
  }

  async #initState(options: { clearAuthEvent?: boolean } = {}) {
    const client = this.#createClient(this.#authConfig);
    await this.#refreshState(client, options.clearAuthEvent ? null : undefined);
  }

  async #refreshState(
    client: AuthClient,
    authEvent: AuthSessionEvent | null | undefined,
  ) {
    const identity = await client.getIdentity();
    const isAuthenticated = client.isAuthenticated();
    this.#state.update((state) => ({
      ...state,
      client,
      identity,
      isAuthenticated,
      lastAuthEvent: authEvent === undefined ? state.lastAuthEvent : authEvent,
      ready: true,
    }));
  }
}

function getCreateOptions(
  options: (AuthClientCreateOptions & AuthClientSignInOptions) | undefined,
): AuthClientCreateOptions {
  if (!options) return {};
  const {
    maxTimeToLive: _maxTimeToLive,
    openIdProvider: _openIdProvider,
    targets: _targets,
    ...createOptions
  } = options;
  return createOptions;
}

function getSignInOptions(
  options: (AuthClientCreateOptions & AuthClientSignInOptions) | undefined,
): AuthClientSignInOptions {
  const signInOptions: AuthClientSignInOptions = {};

  if (options?.maxTimeToLive !== undefined) {
    signInOptions.maxTimeToLive = options.maxTimeToLive;
  }

  if (options?.targets && options.targets.length > 0) {
    const unique = new Map(
      options.targets.map((principal) => [principal.toText(), principal]),
    );
    signInOptions.targets = [...unique.values()];
  }

  return signInOptions;
}

function identityProviderWithAttributeProvider(
  identityProvider: AuthClientCreateOptions['identityProvider'],
  provider: { key: 'openid' | 'sso'; value: string },
): string {
  const url = new URL(identityProvider?.toString() ?? 'https://id.ai/authorize');
  url.searchParams.set(provider.key, provider.value);
  return url.toString();
}
