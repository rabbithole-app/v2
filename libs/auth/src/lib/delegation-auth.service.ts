import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AnonymousIdentity, SignIdentity } from '@dfinity/agent';
import { AuthClient, IdbStorage, KEY_STORAGE_KEY } from '@dfinity/auth-client';
import {
  DelegationChain,
  DelegationIdentity,
  Ed25519KeyIdentity,
  JsonnableDelegationChain,
} from '@dfinity/identity';
import { Principal } from '@dfinity/principal';
import { bytesToHex } from '@noble/hashes/utils';
import { interval } from 'rxjs';
import { filter, map, take } from 'rxjs/operators';

import { assertClient } from './asserts';
import { waitDelegationExpired } from './operators';
import { AUTH_CONFIG, IAuthService } from './tokens';

export type AuthClientInstance = Awaited<ReturnType<typeof AuthClient.create>>;
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

async function createAuthClient() {
  return AuthClient.create({
    idleOptions: {
      disableDefaultIdleCallback: true,
      disableIdle: true,
    },
    keyType: 'Ed25519',
  });
}

async function loadDelegationChain(): Promise<DelegationChain | null> {
  const db = new IdbStorage();
  const delegationChainJson = await db.get<JsonnableDelegationChain>(
    KEY_STORAGE_DELEGATION,
  );

  return delegationChainJson
    ? DelegationChain.fromJSON(delegationChainJson)
    : null;
}

async function loadIdentity() {
  const db = new IdbStorage();
  const identityJson = await db.get<string>(KEY_STORAGE_KEY);

  return identityJson
    ? Ed25519KeyIdentity.fromParsedJson(JSON.parse(identityJson))
    : null;
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
  principalId = computed(() => this.#state().identity.getPrincipal().toText());
  ready$ = toObservable(this.#state).pipe(map(({ ready }) => ready));
  #authConfig = inject(AUTH_CONFIG);
  #destroyRef = inject(DestroyRef);
  #popupWindow: Window | null = null;
  #router = inject(Router);

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

  async signIn(options?: { target: Principal }) {
    const client = this.#state().client;
    assertClient(client);

    // AuthClient has generated and saved Ed25519KeyIdentity in the storage
    const identity = (await loadIdentity()) as Ed25519KeyIdentity;
    const publicKey = bytesToHex(
      (identity as Ed25519KeyIdentity).getPublicKey().toDer(),
    );
    const url = new URL(
      this.#authConfig.delegationPath,
      this.#authConfig.appUrl,
    );
    url.searchParams.set('sessionPublicKey', publicKey);

    // Add target canister ID if provided in options
    if (options?.target) {
      url.searchParams.set('target', options.target.toText());
    }

    // Open popup for authentication
    this.#popupWindow = window.open(
      url.toString(),
      'rabbithole-auth',
      'width=500,height=600,popup=yes',
    );

    // Check if popup was closed by user using RxJS
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
    const identity = client.getIdentity();
    const isAuthenticated = await client.isAuthenticated();

    // Try to load saved delegation
    const savedDelegationChain = await loadDelegationChain();
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
    const identity = (await loadIdentity()) as Ed25519KeyIdentity;

    if (!identity) {
      throw new Error('Local identity not found');
    }

    // Create identity with delegation
    const internetIdentity = DelegationIdentity.fromDelegation(
      identity,
      delegationChain,
    );

    this.#state.update((state) => ({
      ...state,
      delegationChain,
      identity: internetIdentity,
      isAuthenticated: true,
    }));

    // Save delegation for later use
    await saveDelegationChain(delegationChain);
    await this.#router.navigate(['/']);
  }

  #setupPostMessageListener() {
    const handler = async (event: MessageEvent) => {
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

        // Close popup after successfully receiving delegation
        if (this.#popupWindow && !this.#popupWindow.closed) {
          this.#popupWindow.close();
          this.#popupWindow = null;
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
