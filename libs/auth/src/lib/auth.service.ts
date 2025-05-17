import {
  computed,
  DestroyRef,
  effect,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { AnonymousIdentity, Identity } from '@dfinity/agent';
import { AuthClient } from '@dfinity/auth-client';
import { connect } from 'ngxtension/connect';
import {
  from,
  map,
  mergeWith,
  ReplaySubject,
  connect as rxConnect,
  Subject,
  switchMap,
} from 'rxjs';

import { assertClient } from './asserts';
import { AUTH_CONFIG, AuthClientLogoutOptions, IAuthService } from './tokens';

interface State {
  client: AuthClient | null;
  identity: Identity;
  isAuthenticated: boolean;
  ready: boolean;
}

const INITIAL_VALUE: State = {
  client: null,
  identity: new AnonymousIdentity(),
  isAuthenticated: false,
  ready: false,
};

@Injectable()
export class AuthService implements IAuthService {
  #state = signal(INITIAL_VALUE);
  identity = computed(() => this.#state().identity);
  isAuthenticated = computed(() => this.#state().isAuthenticated);
  principalId = computed(() => this.#state().identity.getPrincipal().toText());
  ready$ = toObservable(this.#state).pipe(map(({ ready }) => ready));
  #authConfig = inject(AUTH_CONFIG);
  #destroyRef = inject(DestroyRef);
  #refresh = new Subject<void>();

  constructor() {
    this.#initState();
    effect(() => console.info(`Principal ID: ${this.principalId()}`));
  }

  async signIn() {
    const { client } = this.#state();

    assertClient(client);

    const options = this.#authConfig.loginOptions ?? {};

    client.login({
      ...options,
      onSuccess: (message) => {
        if (options.onSuccess) options.onSuccess(message);
        this.#refresh.next();
      },
    });
  }

  async signOut(opts?: AuthClientLogoutOptions) {
    const { client } = this.#state();

    assertClient(client);

    await client.logout(opts);
    this.#refresh.next();
  }

  #initState() {
    const authClient$ = from(AuthClient.create()).pipe(
      rxConnect(
        (shared) =>
          shared.pipe(
            mergeWith(
              this.#refresh.asObservable().pipe(switchMap(() => shared))
            ),
            map((client) => ({ client, identity: client.getIdentity() })),
            rxConnect((shared) =>
              shared.pipe(
                mergeWith(
                  shared.pipe(
                    switchMap(({ client }) => client.isAuthenticated()),
                    map((isAuthenticated) => ({ isAuthenticated, ready: true }))
                  )
                )
              )
            )
          ),
        { connector: () => new ReplaySubject(1) }
      )
    );

    connect(this.#state, authClient$, this.#destroyRef);
  }
}
