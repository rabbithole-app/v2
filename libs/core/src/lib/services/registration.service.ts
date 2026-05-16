import {
  DestroyRef,
  EnvironmentProviders,
  inject,
  Injector,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { fromNullable } from '@dfinity/utils';
import { scopedKeys } from '@icp-sdk/auth/client';
import {
  Actor,
  ActorSubclass,
  HttpAgent,
  HttpAgentOptions,
} from '@icp-sdk/core/agent';
import { IDL } from '@icp-sdk/core/candid';
import { AttributesIdentity } from '@icp-sdk/core/identity';
import { Principal } from '@icp-sdk/core/principal';
import { derivedFrom } from 'ngxtension/derived-from';
import {
  catchError,
  defer,
  distinctUntilChanged,
  filter,
  firstValueFrom,
  from,
  map,
  of,
  retry,
  startWith,
  switchMap,
  throwError,
  timeout,
  timer,
} from 'rxjs';

import {
  AUTH_CONFIG,
  AUTH_IDENTITY_ATTRIBUTES_PROVIDER,
  AUTH_SERVICE,
  AuthConfig,
  AuthSessionEvent,
  IAuthService,
  SignedIdentityAttributes,
} from '@rabbithole/auth';
import { RabbitholeActorService } from '@rabbithole/declarations/backend';

import { HTTP_AGENT_OPTIONS_TOKEN } from '../injectors/http-agent';
import { injectMainActor, MAIN_ACTOR_TOKEN } from '../injectors/main-actor';
import { MAIN_CANISTER_ID_TOKEN } from '../tokens/main-canister';

export const REFERRAL_KEY = 'referralCode';
const DEFAULT_II_SIGNER_CANISTER_ID = 'rdmx6-jaaaa-aaaaa-aaadq-cai';
const IDENTITY_ATTRIBUTES_TIMEOUT_MS = 15_000;
const IDENTITY_ATTRIBUTES_RETRY_ATTEMPTS = 3;
const IDENTITY_ATTRIBUTES_RETRY_DELAY_MS = 500;
const IDENTITY_ATTRIBUTES_CONFIRMATION_ATTEMPTS = 3;
const IDENTITY_ATTRIBUTES_CONFIRMATION_DELAY_MS = 500;

/**
 * Captures `?ref=` query parameter from the current URL,
 * saves it to sessionStorage, and removes it from the URL.
 * Must run before routing to avoid losing the parameter.
 */
export function provideReferralCapture(): EnvironmentProviders {
  return provideAppInitializer(() => {
    const url = new URL(window.location.href);
    const ref = url.searchParams.get('ref');
    if (ref) {
      sessionStorage.setItem(REFERRAL_KEY, ref);
      url.searchParams.delete('ref');
      window.history.replaceState({}, '', url.toString());
    }
  });
}

/**
 * After a fresh authentication event, creates or enriches the User record and
 * applies the referral code from sessionStorage separately.
 *
 * The actor signal may initially hold an actor backed by an anonymous agent
 * (httpAgent starts with a sync anonymous instance). We verify the actor's
 * agent principal is not anonymous before making any calls — this avoids
 * the race between isAuthenticated (sync signal) and httpAgent (async pipeline).
 */
export function provideRegistration(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: AUTH_IDENTITY_ATTRIBUTES_PROVIDER,
      useFactory: () => {
        const injector = inject(Injector);
        return async (authEvent: AuthSessionEvent) => {
          const keys = attributeKeys(authEvent);
          if (keys.length === 0) return null;

          const actor = injector.get(MAIN_ACTOR_TOKEN)();
          const nonce = await actor.attributeNonceBegin();
          return {
            keys,
            nonce,
          };
        };
      },
    },
    provideAppInitializer(() => {
      const actor = injectMainActor();
      const authService = inject(AUTH_SERVICE);
      const authConfig = inject(AUTH_CONFIG);
      const destroyRef = inject(DestroyRef);
      const httpAgentOptions = inject(HTTP_AGENT_OPTIONS_TOKEN);
      const canisterId = inject(MAIN_CANISTER_ID_TOKEN);

      const registrationState = derivedFrom({
        actor,
        authEvent: authService.lastAuthEvent,
        isAuthenticated: authService.isAuthenticated,
        principalId: authService.principalId,
        ready: authService.ready$.pipe(startWith(false)),
      });

      toObservable(registrationState)
        .pipe(
          filter((state) => state.ready && state.isAuthenticated),
          distinctUntilChanged(
            (prev, next) =>
              prev.actor === next.actor &&
              prev.principalId === next.principalId &&
              prev.authEvent?.id === next.authEvent?.id,
          ),
          switchMap(({ actor: nextActor, authEvent }) =>
            from(getAuthenticatedActor(nextActor)).pipe(
              map((authenticatedActor) => ({ authenticatedActor, authEvent })),
              filter(
                (
                  value,
                ): value is {
                  authenticatedActor: ActorSubclass<RabbitholeActorService>;
                  authEvent: AuthSessionEvent | null;
                } => value.authenticatedActor != null,
              ),
            ),
          ),
          takeUntilDestroyed(destroyRef),
        )
        .subscribe(({ authenticatedActor, authEvent }) =>
          ensureRegistered({
            actor: authenticatedActor,
            authConfig,
            authEvent,
            authService,
            canisterId,
            httpAgentOptions,
          }),
        );
    }),
  ]);
}

function attributeKeys(authEvent: AuthSessionEvent): string[] {
  if (authEvent.ssoDomain) {
    return ['name', 'email'].map((key) => `sso:${authEvent.ssoDomain}:${key}`);
  }

  if (authEvent.openIdIssuer) {
    return ['name', 'email', 'verified_email'].map(
      (key) => `openid:${authEvent.openIdIssuer}:${key}`,
    );
  }

  if (authEvent.openIdProvider) {
    return scopedKeys({ openIdProvider: authEvent.openIdProvider });
  }

  return [];
}

function authProviderFromEvent(authEvent: AuthSessionEvent): string | null {
  if (authEvent.ssoDomain) {
    return 'sso';
  }

  if (authEvent.openIdProvider) {
    return authEvent.openIdProvider;
  }

  if (!authEvent.openIdIssuer) {
    return null;
  }

  if (authEvent.openIdIssuer === 'https://openid.localhost') {
    return 'dev_openid';
  }

  if (authEvent.openIdIssuer.includes('accounts.google.com')) {
    return 'google';
  }

  if (authEvent.openIdIssuer.includes('appleid.apple.com')) {
    return 'apple';
  }

  if (authEvent.openIdIssuer.includes('login.microsoftonline.com')) {
    return 'microsoft';
  }

  return 'openid';
}

async function ensureRegistered({
  actor,
  authConfig,
  authEvent,
  authService,
  canisterId,
  httpAgentOptions,
}: {
  actor: ActorSubclass<RabbitholeActorService>;
  authConfig: AuthConfig;
  authEvent: AuthSessionEvent | null;
  authService: IAuthService;
  canisterId: Principal;
  httpAgentOptions: Omit<HttpAgentOptions, 'identity'>;
}) {
  try {
    const user = await actor.getUser();
    const referralCode = sessionStorage.getItem(REFERRAL_KEY);
    const existingUser = fromNullable(user);

    if (authEvent?.hasAttributes) {
      const synced = await syncIdentityAttributes({
        actor,
        authConfig,
        authEvent,
        authService,
        canisterId,
        httpAgentOptions,
      });
      const registered =
        existingUser != null ||
        (synced && (await waitForRegisteredUser(actor)));

      if (!registered) {
        const fallbackProvider =
          authProviderFromEvent(authEvent) ?? 'internet_identity';
        await actor.ensureUser([fallbackProvider]);
      }
    } else if (existingUser == null) {
      await actor.ensureUser(['internet_identity']);
    }

    if (referralCode) {
      const result = await actor.applyReferralCode(referralCode);
      if (!('ok' in result) && !('alreadyApplied' in result)) {
        console.warn('Referral code was not applied:', result);
      }
      sessionStorage.removeItem(REFERRAL_KEY);
    }
  } catch (e) {
    console.error('Auto-registration failed:', e);
  }
}

async function getAuthenticatedActor(
  actor: ActorSubclass<RabbitholeActorService>,
): Promise<ActorSubclass<RabbitholeActorService> | null> {
  const agent = Actor.agentOf(actor);
  if (!agent) {
    return null;
  }

  const principal = await agent.getPrincipal();
  if (principal.isAnonymous()) {
    return null;
  }

  return actor;
}

async function requestAttributesWithRetry<T>(
  request: () => Promise<T>,
  attempts: number,
  delayMs: number,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  return firstValueFrom(
    defer(request).pipe(
      timeout({
        first: timeoutMs,
        with: () => throwError(() => new Error(timeoutMessage)),
      }),
      retry({
        count: Math.max(0, attempts - 1),
        delay: (_error: unknown, retryCount: number) =>
          timer(delayMs * retryCount),
      }),
    ),
  );
}

async function requestSignedIdentityAttributesAfterSignIn({
  actor,
  authEvent: _authEvent,
  authService,
  keys,
}: {
  actor: ActorSubclass<RabbitholeActorService>;
  authEvent: AuthSessionEvent;
  authService: IAuthService;
  keys: string[];
}): Promise<SignedIdentityAttributes | null> {
  if (!authService.requestAttributes) {
    return null;
  }

  const requestAttributes = authService.requestAttributes;
  const nonce = await actor.attributeNonceBegin();
  const attributes = await requestAttributesWithRetry(
    () => requestAttributes({ keys, nonce }),
    IDENTITY_ATTRIBUTES_RETRY_ATTEMPTS,
    IDENTITY_ATTRIBUTES_RETRY_DELAY_MS,
    IDENTITY_ATTRIBUTES_TIMEOUT_MS,
    'requestAttributes timed out',
  );

  return { attributes, keys, nonce };
}

async function submitSignedIdentityAttributes({
  authConfig,
  authService,
  canisterId,
  httpAgentOptions,
  signedAttributes,
}: {
  authConfig: AuthConfig;
  authService: IAuthService;
  canisterId: Principal;
  httpAgentOptions: Omit<HttpAgentOptions, 'identity'>;
  signedAttributes: SignedIdentityAttributes;
}): Promise<boolean> {
  try {
    const identity = new AttributesIdentity({
      attributes: signedAttributes.attributes,
      inner: authService.identity(),
      signer: {
        canisterId: Principal.fromText(
          authConfig.identitySignerCanisterId ?? DEFAULT_II_SIGNER_CANISTER_ID,
        ),
      },
    });
    const agent = await HttpAgent.create({ ...httpAgentOptions, identity });
    await agent.call(canisterId, {
      arg: IDL.encode([IDL.Vec(IDL.Nat8)], [signedAttributes.nonce]),
      callSync: false,
      effectiveCanisterId: canisterId,
      methodName: 'syncIdentityAttributes',
    });
    return true;
  } catch {
    return false;
  }
}

async function syncIdentityAttributes({
  actor,
  authConfig,
  authEvent,
  authService,
  canisterId,
  httpAgentOptions,
}: {
  actor: ActorSubclass<RabbitholeActorService>;
  authConfig: AuthConfig;
  authEvent: AuthSessionEvent;
  authService: IAuthService;
  canisterId: Principal;
  httpAgentOptions: Omit<HttpAgentOptions, 'identity'>;
}): Promise<boolean> {
  if (
    !authEvent.openIdProvider &&
    !authEvent.openIdIssuer &&
    !authEvent.ssoDomain
  ) {
    return false;
  }

  try {
    const keys = attributeKeys(authEvent);
    const signedAttributes =
      authEvent.identityAttributes ??
      (await requestSignedIdentityAttributesAfterSignIn({
        actor,
        authEvent,
        authService,
        keys,
      }));

    if (!signedAttributes) return false;

    return await submitSignedIdentityAttributes({
      authConfig,
      authService,
      canisterId,
      httpAgentOptions,
      signedAttributes,
    });
  } catch {
    return false;
  }
}

async function waitForRegisteredUser(
  actor: ActorSubclass<RabbitholeActorService>,
): Promise<boolean> {
  return firstValueFrom(
    defer(() => actor.getUser()).pipe(
      map((user) => fromNullable(user) != null),
      switchMap((registered) =>
        registered
          ? of(true)
          : throwError(() => new Error('User is not registered yet')),
      ),
      retry({
        count: IDENTITY_ATTRIBUTES_CONFIRMATION_ATTEMPTS - 1,
        delay: (_error: unknown, retryCount: number) =>
          timer(IDENTITY_ATTRIBUTES_CONFIRMATION_DELAY_MS * retryCount),
      }),
      catchError(() => of(false)),
    ),
  );
}
