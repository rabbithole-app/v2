import { DestroyRef, EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { fromNullable } from '@dfinity/utils';
import { scopedKeys } from '@icp-sdk/auth/client';
import { Actor, ActorSubclass, HttpAgent, HttpAgentOptions } from '@icp-sdk/core/agent';
import { AttributesIdentity } from '@icp-sdk/core/identity';
import { Principal } from '@icp-sdk/core/principal';
import { combineLatest, distinctUntilChanged, filter, from, map, switchMap } from 'rxjs';

import {
  AUTH_CONFIG,
  AUTH_SERVICE,
  AuthConfig,
  AuthSessionEvent,
  IAuthService,
} from '@rabbithole/auth';
import {
  RabbitholeActorService,
  rabbitholeIdlFactory,
} from '@rabbithole/declarations/backend';

import { HTTP_AGENT_OPTIONS_TOKEN } from '../injectors/http-agent';
import { injectMainActor } from '../injectors/main-actor';
import { MAIN_CANISTER_ID_TOKEN } from '../tokens/main-canister';

export const REFERRAL_KEY = 'referralCode';
const DEFAULT_II_SIGNER_CANISTER_ID = 'rdmx6-jaaaa-aaaaa-aaadq-cai';

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
  return provideAppInitializer(() => {
    const actor = injectMainActor();
    const authService = inject(AUTH_SERVICE);
    const authConfig = inject(AUTH_CONFIG);
    const destroyRef = inject(DestroyRef);
    const httpAgentOptions = inject(HTTP_AGENT_OPTIONS_TOKEN);
    const canisterId = inject(MAIN_CANISTER_ID_TOKEN);

    combineLatest([toObservable(actor), toObservable(authService.lastAuthEvent)])
      .pipe(
        filter(
          (value): value is [
            ActorSubclass<RabbitholeActorService>,
            AuthSessionEvent,
          ] => value[1] != null,
        ),
        distinctUntilChanged(([, prev], [, next]) => prev.id === next.id),
        switchMap(([a, authEvent]) =>
          from(getAuthenticatedActor(a)).pipe(
            map((authenticatedActor) => ({ authenticatedActor, authEvent })),
            filter(
              (value): value is {
                authenticatedActor: ActorSubclass<RabbitholeActorService>;
                authEvent: AuthSessionEvent;
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
  });
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
  authEvent: AuthSessionEvent;
  authService: IAuthService;
  canisterId: Principal;
  httpAgentOptions: Omit<HttpAgentOptions, 'identity'>;
}) {
  try {
    const user = await actor.getUser();
    const referralCode = sessionStorage.getItem(REFERRAL_KEY);

    if (authEvent.hasAttributes) {
      const synced = await syncIdentityAttributes({
        actor,
        authConfig,
        authEvent,
        authService,
        canisterId,
        httpAgentOptions,
      });
      if (!synced && fromNullable(user) == null) {
        await actor.ensureUser(['internet_identity']);
      }
    } else if (fromNullable(user) == null) {
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
  if (!agent) return null;

  const principal = await agent.getPrincipal();
  return principal.isAnonymous() ? null : actor;
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
    !authService.requestAttributes ||
    (!authEvent.openIdProvider && !authEvent.openIdIssuer && !authEvent.ssoDomain)
  ) {
    return false;
  }

  try {
    const nonce = await actor.attributeNonceBegin();
    const attributes = await authService.requestAttributes({
      keys: attributeKeys(authEvent),
      nonce,
    });
    const identity = new AttributesIdentity({
      attributes,
      inner: authService.identity(),
      signer: {
        canisterId: Principal.fromText(
          authConfig.identitySignerCanisterId ?? DEFAULT_II_SIGNER_CANISTER_ID,
        ),
      },
    });
    const agent = await HttpAgent.create({ ...httpAgentOptions, identity });
    const attributesActor = Actor.createActor<RabbitholeActorService>(
      rabbitholeIdlFactory,
      { agent, canisterId },
    );
    const result = await attributesActor.syncIdentityAttributes(nonce);

    if ('err' in result) {
      console.warn('Identity attributes were not synced:', result.err);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('Identity attributes were not synced:', error);
    return false;
  }
}
