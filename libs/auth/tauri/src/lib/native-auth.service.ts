import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { AnonymousIdentity, SignIdentity } from '@icp-sdk/core/agent';
import {
  DelegationChain,
  DelegationIdentity,
  Ed25519KeyIdentity,
  JsonnableDelegationChain,
} from '@icp-sdk/core/identity';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { map } from 'rxjs/operators';

import { IAuthService, waitDelegationExpired } from '@rabbithole/auth';

interface AuthBridgeData {
  delegationChain: JsonnableDelegationChain;
  identity: [string, string];
}

interface AuthStatusPayload {
  is_authenticated: boolean;
  principal: string | null;
}

interface State {
  delegationChain: DelegationChain | null;
  identity: AnonymousIdentity | SignIdentity;
  isAuthenticated: boolean;
  ready: boolean;
}

const INITIAL_VALUE: State = {
  delegationChain: null,
  identity: new AnonymousIdentity(),
  isAuthenticated: false,
  ready: false,
};

/**
 * Auth service for Tauri desktop app using NativeAuthClient (Rust-side).
 *
 * Flow:
 * 1. On init, checks if Rust has a restored session from OS keyring
 * 2. If yes, fetches delegation chain via `get_delegation_chain` command
 *    and creates DelegationIdentity for Angular's HttpAgent
 * 3. On signIn(), calls Rust `sign_in` command which opens system browser
 * 4. Listens for `auth-success` event, then fetches delegation chain
 * 5. Creates DelegationIdentity from the delegation chain + Ed25519 session key
 */
@Injectable()
export class TauriNativeAuthService implements IAuthService {
  #state = signal(INITIAL_VALUE);
  identity = computed(() => this.#state().identity);
  isAuthenticated = computed(() => this.#state().isAuthenticated);
  lastAuthEvent = computed(() => null);
  principalId = computed(() => this.#state().identity.getPrincipal().toText());
  ready$ = toObservable(this.#state).pipe(map(({ ready }) => ready));
  #destroyRef = inject(DestroyRef);

  constructor() {
    // Auto-sign-out when delegation expires
    toObservable(this.#state)
      .pipe(
        map(({ delegationChain }) => delegationChain),
        waitDelegationExpired(),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.signOut());

    this.#init();
  }

  async signIn() {
    await invoke('sign_in', {});
  }

  async signOut() {
    await invoke('sign_out');
    this.#state.update((state) => ({
      ...state,
      delegationChain: null,
      identity: new AnonymousIdentity(),
      isAuthenticated: false,
    }));
  }

  async #init() {
    // Listen for auth-success events from Rust (login callback)
    const unlisten = await listen('auth-success', () => {
      this.#restoreIdentity();
    });
    this.#destroyRef.onDestroy(() => unlisten());

    // Check if Rust already has a restored session
    try {
      const status = await invoke<AuthStatusPayload>('auth_status');
      if (status.is_authenticated) {
        await this.#restoreIdentity();
      } else {
        this.#state.update((state) => ({ ...state, ready: true }));
      }
    } catch (e) {
      console.warn('Failed to check auth status, signing out:', e);
      await this.signOut();
      this.#state.update((state) => ({ ...state, ready: true }));
    }
  }

  async #restoreIdentity() {
    try {
      const data = await invoke<AuthBridgeData>('get_delegation_chain');

      // Recreate Ed25519KeyIdentity from the JS-format key pair
      const sessionKey = Ed25519KeyIdentity.fromParsedJson(data.identity);

      // Parse delegation chain from JS-compatible JSON
      const delegationChain = DelegationChain.fromJSON(data.delegationChain);

      // Create DelegationIdentity (this is what HttpAgent uses for signing)
      const identity = DelegationIdentity.fromDelegation(
        sessionKey,
        delegationChain,
      );

      this.#state.set({
        delegationChain,
        identity,
        isAuthenticated: true,
        ready: true,
      });
    } catch (e) {
      console.error('Failed to restore identity from Rust:', e);
      this.#state.update((state) => ({
        ...state,
        isAuthenticated: false,
        ready: true,
      }));
    }
  }
}
