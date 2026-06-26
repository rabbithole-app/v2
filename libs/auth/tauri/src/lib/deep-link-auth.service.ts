import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { AuthClient } from '@icp-sdk/auth/client';
import { AnonymousIdentity, SignIdentity } from '@icp-sdk/core/agent';
import {
  DelegationChain,
  DelegationIdentity,
  JsonnableDelegationChain,
} from '@icp-sdk/core/identity';
import { bytesToHex } from '@noble/hashes/utils';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { openUrl } from '@tauri-apps/plugin-opener';
import { map } from 'rxjs/operators';

import {
  assertClient,
  AUTH_CONFIG,
  IAuthService,
  waitDelegationExpired,
} from '@rabbithole/auth';

import {
  clearDelegationChain,
  createAuthClient,
  isDelegationChainValid,
  loadDelegationChain,
  loadIdentity,
  loadOrCreateIdentity,
  saveDelegationChain,
} from './utils';

export type AuthClientInstance = AuthClient;
export type AuthClientSignOutOptions = Parameters<
  AuthClientInstance['signOut']
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

@Injectable()
export class TauriDeepLinkAuthService implements IAuthService {
  #state = signal(INITIAL_VALUE);
  identity = computed(() => this.#state().identity);
  isAuthenticated = computed(() => this.#state().isAuthenticated);
  lastAuthEvent = computed(() => null);
  principalId = computed(() => this.#state().identity.getPrincipal().toText());
  ready$ = toObservable(this.#state).pipe(map(({ ready }) => ready));
  #authConfig = inject(AUTH_CONFIG);
  #destroyRef = inject(DestroyRef);

  constructor() {
    toObservable(this.#state)
      .pipe(
        map(({ delegationChain }) => delegationChain),
        waitDelegationExpired(),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.signOut());
    this.#initState();
  }

  async signIn() {
    const identity = await loadOrCreateIdentity();
    const publicKey = bytesToHex(identity.getPublicKey().toDer());
    const url = new URL(
      this.#authConfig.delegationPath,
      this.#authConfig.appUrl,
    );
    url.searchParams.set('sessionPublicKey', publicKey);
    url.searchParams.set('autoDelegate', '1');

    // Here we open a browser and continue on the website.
    await openDelegationUrl(url);
  }

  signOut(options?: AuthClientSignOutOptions) {
    const { client } = this.#state();
    this.#state.update((state) => ({
      ...state,
      delegationChain: null,
      identity: new AnonymousIdentity(),
      isAuthenticated: false,
    }));

    assertClient(client);

    return client.signOut(options).then(() => clearDelegationChain());
  }

  async #initState() {
    const client = await createAuthClient();
    const sessionIdentity = await loadIdentity();
    const savedDelegationChain = sessionIdentity
      ? await loadDelegationChain(this.#requiredDelegationTargets())
      : null;
    const identity = sessionIdentity && savedDelegationChain
      ? DelegationIdentity.fromDelegation(sessionIdentity, savedDelegationChain)
      : (sessionIdentity ?? new AnonymousIdentity());

    this.#state.update((state) => ({
      ...state,
      client,
      delegationChain: savedDelegationChain,
      identity,
      isAuthenticated: !!savedDelegationChain,
      ready: true,
    }));

    const unlistenFn = await onOpenUrl((urls) => {
      void this.#parseDelegationFromUrl(urls[0]).catch(console.error);
    });
    this.#destroyRef.onDestroy(() => unlistenFn());

    const startUrls = await getCurrent();
    const startUrl = startUrls?.[0];
    if (startUrl) {
      await this.#parseDelegationFromUrl(startUrl).catch(console.error);
    }
  }

  async #parseDelegationFromUrl(url: string) {
    const identity = await loadIdentity();

    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== `${this.#authConfig.scheme}:`) {
      return;
    }

    if (!identity) {
      throw new Error('Deep link callback has no saved session identity.');
    }

    const encodedDelegationChain =
      parsedUrl.searchParams.get('delegationChain');
    if (!encodedDelegationChain) {
      throw new Error('Deep link callback is missing delegationChain.');
    }

    const json: JsonnableDelegationChain = JSON.parse(encodedDelegationChain);

    const delegationChain: DelegationChain = DelegationChain.fromJSON(json);
    if (
      !isDelegationChainValid(
        delegationChain,
        this.#requiredDelegationTargets(),
      )
    ) {
      await clearDelegationChain();
      throw new Error('Deep link callback contains an invalid delegation.');
    }

    // Here we create an identity with the delegation chain we received from the website
    const internetIdentity = DelegationIdentity.fromDelegation(
      identity,
      delegationChain,
    );

    this.#state.update((state) => ({
      ...state,
      delegationChain,
      identity: internetIdentity,
      isAuthenticated: true,
      ready: true,
    }));

    await saveDelegationChain(delegationChain);
  }

  #requiredDelegationTargets() {
    return this.#authConfig.delegationTargets ?? [];
  }
}

async function openDelegationUrl(url: URL) {
  const href = url.toString();

  try {
    await openUrl(href);
    return;
  } catch (defaultBrowserError) {
    try {
      await openUrl(href, 'inAppBrowser');
      return;
    } catch (inAppBrowserError) {
      throw new Error(
        `Failed to open delegation URL. Default browser: ${formatError(defaultBrowserError)}. In-app browser: ${formatError(inAppBrowserError)}`,
      );
    }
  }
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
