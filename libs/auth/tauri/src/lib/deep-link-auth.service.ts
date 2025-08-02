import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { AnonymousIdentity, SignIdentity } from '@dfinity/agent';
import { AuthClient } from '@dfinity/auth-client';
import {
  DelegationChain,
  DelegationIdentity,
  Ed25519KeyIdentity,
  JsonnableDelegationChain,
} from '@dfinity/identity';
import { bytesToHex } from '@noble/hashes/utils';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { openUrl } from '@tauri-apps/plugin-opener';
import { map } from 'rxjs/operators';

import { waitDelegationExpired } from './operators';
import { createAuthClient, loadIdentity, saveDelegationChain } from './utils';
import { assertClient, AUTH_CONFIG, IAuthService } from '@rabbithole/auth';

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

@Injectable()
export class TauriDeepLinkAuthService implements IAuthService {
  #state = signal(INITIAL_VALUE);
  identity = computed(() => this.#state().identity);
  isAuthenticated = computed(() => this.#state().isAuthenticated);
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
    // AuthClient has generated and saved Ed25519KeyIdentity in the storage
    const identity = (await loadIdentity()) as Ed25519KeyIdentity;
    const publicKey = bytesToHex(identity.getPublicKey().toDer());
    const url = `${this.#authConfig.appUrl}${
      this.#authConfig.delegationPath
    }?sessionPublicKey=${publicKey}`;

    // Here we open a browser and continue on the website
    await openUrl(url);
  }

  signOut(options?: AuthClientLogoutOptions) {
    const { client } = this.#state();
    this.#state.update((state) => ({
      ...state,
      delegationChain: null,
      isAuthenticated: false,
    }));

    assertClient(client);

    return client.logout(options);
  }

  async #initState() {
    const client = await createAuthClient();
    const identity = client.getIdentity();
    const isAuthenticated = await client.isAuthenticated();

    this.#state.update((state) => ({
      ...state,
      client,
      identity,
      isAuthenticated,
      ready: true,
    }));

    const unlistenFn = await onOpenUrl((urls) =>
      this.#parseDelegationFromUrl(urls[0]),
    );
    this.#destroyRef.onDestroy(() => unlistenFn());
  }

  async #parseDelegationFromUrl(url: string) {
    const identity = (await loadIdentity()) as Ed25519KeyIdentity;

    // Get JSON from deep link query param
    const encodedDelegationChain = url.replace(
      `${this.#authConfig.scheme}://internetIdentityCallback?delegationChain=`,
      '',
    );
    const json: JsonnableDelegationChain = JSON.parse(
      decodeURIComponent(encodedDelegationChain),
    );

    const delegationChain: DelegationChain = DelegationChain.fromJSON(json);

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
    }));

    await saveDelegationChain(delegationChain);
  }
}
