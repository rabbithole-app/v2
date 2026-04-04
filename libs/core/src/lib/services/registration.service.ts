import { EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { fromNullable } from '@dfinity/utils';
import { Actor, ActorSubclass } from '@icp-sdk/core/agent';
import { filter, from, map, switchMap, take } from 'rxjs';

import { AUTH_SERVICE } from '@rabbithole/auth';
import { RabbitholeActorService } from '@rabbithole/declarations';

import { injectMainActor } from '../injectors';

export const REFERRAL_KEY = 'referralCode';

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
 * After authentication, checks if a User record exists.
 * If not, calls `register()` with the referral code from sessionStorage.
 * Runs once per session — idempotent on the backend side as well.
 *
 * The actor signal may initially hold an actor backed by an anonymous agent
 * (httpAgent starts with a sync anonymous instance). We verify the actor's
 * agent principal is not anonymous before making any calls — this avoids
 * the race between isAuthenticated (sync signal) and httpAgent (async pipeline).
 */
export function provideRegistration(): EnvironmentProviders {
  return provideAppInitializer(() => {
    const actor = injectMainActor();

    toObservable(actor).pipe(
      switchMap((a) =>
        from(Actor.agentOf(a)!.getPrincipal()).pipe(
          filter((p) => !p.isAnonymous()),
          map(() => a),
        ),
      ),
      take(1),
    ).subscribe((currentActor) => ensureRegistered(currentActor));
  });
}

async function ensureRegistered(
  actor: ActorSubclass<RabbitholeActorService>,
) {
  try {
    const user = await actor.getUser();
    if (fromNullable(user) != null) return;

    const referralCode = sessionStorage.getItem(REFERRAL_KEY);
    await actor.register(referralCode ? [referralCode] : []);
    sessionStorage.removeItem(REFERRAL_KEY);
  } catch (e) {
    console.error('Auto-registration failed:', e);
  }
}
