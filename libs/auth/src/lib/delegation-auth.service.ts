import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { AuthClient, IdbStorage, KEY_STORAGE_KEY } from '@icp-sdk/auth/client';
import { AnonymousIdentity, SignIdentity } from '@icp-sdk/core/agent';
import {
  DelegationChain,
  DelegationIdentity,
  Ed25519KeyIdentity,
  isDelegationValid,
  JsonnableDelegationChain,
} from '@icp-sdk/core/identity';
import { Principal } from '@icp-sdk/core/principal';
import { bytesToHex } from '@noble/hashes/utils';
import { interval } from 'rxjs';
import { filter, map, take } from 'rxjs/operators';

import { assertClient } from './asserts';
import { waitDelegationExpired } from './operators';
import { AUTH_CONFIG, AuthSignInOptions, IAuthService } from './tokens';

export type AuthClientInstance = AuthClient;
export type AuthClientLogoutOptions = Parameters<
  AuthClientInstance['logout']
>[0];

interface State {
  client: AuthClient | null;
  delegationChain: DelegationChain | null;
  identity: AnonymousIdentity | SignIdentity;
  isAuthenticated: boolean;
  ready: boolean;
}

const INITIAL_VALUE: State = {
  client: null,
  delegationChain: null,
  identity: new AnonymousIdentity(),
  isAuthenticated: false,
  ready: false,
};

const KEY_STORAGE_DELEGATION = 'delegationChain';
const DELEGATION_POPUP_CLOSE_DELAY_MS = 2000;

async function clearDelegationChain() {
  const db = new IdbStorage();
  await db.remove(KEY_STORAGE_DELEGATION);
}

async function createAuthClient() {
  return new AuthClient({
    idleOptions: {
      disableDefaultIdleCallback: true,
      disableIdle: true,
    },
    keyType: 'Ed25519',
  });
}

function isDelegationTargetedTo(
  delegationChain: DelegationChain,
  target: Principal,
): boolean {
  return delegationChain.delegations.some(({ delegation }) =>
    delegation.targets?.some((scope) => scope.toText() === target.toText()),
  );
}

async function loadDelegationChain(
  target?: Principal,
): Promise<DelegationChain | null> {
  const db = new IdbStorage();
  const delegationChainJson = await db.get<JsonnableDelegationChain>(
    KEY_STORAGE_DELEGATION,
  );

  if (!delegationChainJson) {
    return null;
  }

  const delegationChain = DelegationChain.fromJSON(delegationChainJson);

  const isValid = target
    ? isDelegationValid(delegationChain, { scope: target }) &&
      isDelegationTargetedTo(delegationChain, target)
    : isDelegationValid(delegationChain);

  if (!isValid) {
    await db.remove(KEY_STORAGE_DELEGATION);
    return null;
  }

  return delegationChain;
}

async function loadIdentity() {
  const db = new IdbStorage();
  const identityJson = await db.get<string>(KEY_STORAGE_KEY);

  return identityJson
    ? Ed25519KeyIdentity.fromParsedJson(JSON.parse(identityJson))
    : null;
}

async function loadOrCreateIdentity(): Promise<Ed25519KeyIdentity> {
  const existing = await loadIdentity();
  if (existing) return existing;

  const identity = Ed25519KeyIdentity.generate();
  const db = new IdbStorage();
  await db.set(KEY_STORAGE_KEY, JSON.stringify(identity.toJSON()));
  return identity;
}

async function saveDelegationChain(delegationChain: DelegationChain) {
  const db = new IdbStorage();
  await db.set(KEY_STORAGE_DELEGATION, delegationChain.toJSON());
}

@Injectable()
export class DelegationAuthService implements IAuthService {
  #state = signal(INITIAL_VALUE);
  identity = computed(() => this.#state().identity);
  isAuthenticated = computed(() => this.#state().isAuthenticated);
  lastAuthEvent = computed(() => null);
  principalId = computed(() => this.#state().identity.getPrincipal().toText());
  ready$ = toObservable(this.#state).pipe(map(({ ready }) => ready));
  #authConfig = inject(AUTH_CONFIG);
  #destroyRef = inject(DestroyRef);
  #popupWindow: Window | null = null;

  constructor() {
    toObservable(this.#state)
      .pipe(
        map(({ delegationChain }) => delegationChain),
        waitDelegationExpired(),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.signOut());
    this.#initState();
    this.#setupPostMessageListener();
  }

  async signIn(options?: AuthSignInOptions) {
    const client = this.#state().client;
    assertClient(client);

    const identity = await loadOrCreateIdentity();
    const publicKey = bytesToHex(identity.getPublicKey().toDer());
    const url = new URL(
      this.#authConfig.delegationPath,
      this.#authConfig.appUrl,
    );
    url.searchParams.set('sessionPublicKey', publicKey);

    // Add target canister ID if provided in options
    const target = options?.target ?? this.#authConfig.delegationTarget;
    if (target) {
      url.searchParams.set('target', target.toText());
    }
    if (options?.openIdIssuer) {
      url.searchParams.set('openid', options.openIdIssuer);
    }
    if (options?.openIdProvider) {
      url.searchParams.set('provider', options.openIdProvider);
    }
    if (options?.ssoDomain) {
      url.searchParams.set('sso', options.ssoDomain);
    }

    // Open the broker delegation page as a regular tab. That page may still
    // open the identity provider window, so avoid creating a popup-in-popup flow.
    this.#popupWindow = window.open(url.toString(), '_blank');
    this.#popupWindow?.focus();

    if (this.#popupWindow) {
      interval(500)
        .pipe(
          filter(() => this.#popupWindow?.closed ?? false),
          take(1),
          takeUntilDestroyed(this.#destroyRef),
        )
        .subscribe(() => {
          this.#popupWindow = null;
        });
    }
  }

  async signOut(options?: AuthClientLogoutOptions) {
    let client = this.#state().client;

    assertClient(client);

    client.logout(options);
    await clearDelegationChain();
    client = await createAuthClient();

    this.#state.update((state) => ({
      ...state,
      client,
      delegationChain: null,
      isAuthenticated: false,
    }));
  }

  async #initState() {
    const client = await createAuthClient();
    const identity = await client.getIdentity();
    const isAuthenticated = client.isAuthenticated();

    // Try to load saved delegation
    const savedDelegationChain = await loadDelegationChain(
      this.#authConfig.delegationTarget,
    );
    let finalIdentity = identity;
    let finalIsAuthenticated = isAuthenticated;

    if (savedDelegationChain) {
      const localIdentity = (await loadIdentity()) as Ed25519KeyIdentity;
      if (localIdentity) {
        try {
          finalIdentity = DelegationIdentity.fromDelegation(
            localIdentity,
            savedDelegationChain,
          );
          finalIsAuthenticated = true;
        } catch {
          // Delegation is invalid, remove it
          const db = new IdbStorage();
          await db.remove(KEY_STORAGE_DELEGATION);
        }
      }
    }

    this.#state.update((state) => ({
      ...state,
      client,
      identity: finalIdentity,
      delegationChain: savedDelegationChain,
      isAuthenticated: finalIsAuthenticated,
      ready: true,
    }));
  }

  async #parseDelegationChain(delegationChain: DelegationChain) {
    const identity = await loadIdentity();

    if (!identity) {
      throw new Error('Local identity not found');
    }

    // Create identity with delegation
    const internetIdentity = DelegationIdentity.fromDelegation(
      identity,
      delegationChain,
    );

    const target = this.#authConfig.delegationTarget;
    if (
      target &&
      (!isDelegationValid(delegationChain, { scope: target }) ||
        !isDelegationTargetedTo(delegationChain, target))
    ) {
      throw new Error(
        `Delegation is not valid for storage canister ${target.toText()}`,
      );
    }

    await saveDelegationChain(delegationChain);

    this.#state.update((state) => ({
      ...state,
      delegationChain,
      identity: internetIdentity,
      isAuthenticated: true,
    }));
  }

  #setupPostMessageListener() {
    const handler = async (event: MessageEvent) => {
      if (event.data?.type === 'DELEGATION_CANCELLED') {
        const rabbitholeOrigin = new URL(this.#authConfig.appUrl).origin;
        const isValidOrigin =
          event.origin === rabbitholeOrigin ||
          event.origin === window.location.origin;

        if (isValidOrigin && this.#popupWindow && !this.#popupWindow.closed) {
          this.#popupWindow.close();
          this.#popupWindow = null;
        }
        return;
      }

      // Check message type first
      if (event.data?.type !== 'DELEGATION_CHAIN') {
        return;
      }

      // Check origin for security
      // Message comes from rabbithole (child window opened via window.open)
      // We need to accept messages from rabbithole origin
      const rabbitholeOrigin = new URL(this.#authConfig.appUrl).origin;

      // Accept messages from rabbithole origin (where delegation happens)
      // Also accept from current origin in case of same-origin
      const isValidOrigin =
        event.origin === rabbitholeOrigin ||
        event.origin === window.location.origin;

      if (!isValidOrigin) {
        return;
      }

      try {
        const delegationChain = DelegationChain.fromJSON(
          event.data.delegationChain,
        );
        await this.#parseDelegationChain(delegationChain);

        if (this.#popupWindow && !this.#popupWindow.closed) {
          const popupWindow = this.#popupWindow;
          this.#popupWindow = null;
          window.setTimeout(() => {
            if (!popupWindow.closed) {
              popupWindow.close();
            }
          }, DELEGATION_POPUP_CLOSE_DELAY_MS);
        }
      } catch (error) {
        console.error('Failed to parse delegation chain:', error);
      }
    };

    window.addEventListener('message', handler);
    this.#destroyRef.onDestroy(() => {
      window.removeEventListener('message', handler);
    });
  }
}
