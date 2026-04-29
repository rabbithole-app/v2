import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  hugeApple,
  hugeDeveloper,
  hugeGoogle,
  hugeMicrosoft,
} from '@ng-icons/huge-icons';
import { map } from 'rxjs';

import {
  AUTH_CONFIG,
  AUTH_SERVICE,
  AuthOpenIdProviderConfig,
  AuthSignInOptions,
} from '@rabbithole/auth';
import { ENCRYPTED_STORAGE_CANISTER_ID } from '@rabbithole/core';
import { RbthRainbowButton } from '@rabbithole/ui';

@Component({
  selector: 'rbth-page-login',
  imports: [NgIcon, RbthRainbowButton],
  providers: [
    provideIcons({ hugeApple, hugeDeveloper, hugeGoogle, hugeMicrosoft }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative z-10 flex min-h-[calc(100dvh-3.5rem)] flex-col items-center justify-center px-4 py-12',
  },
  template: `
    <h1 class="text-center text-3xl font-bold tracking-tight sm:text-4xl">
      Sign in to Rabbithole
    </h1>
    <p class="mx-auto mt-3 max-w-sm text-center text-muted-foreground">
      {{ subtitle }}
    </p>

    @if (openIdProviders.length > 0) {
      <div class="mt-8 grid w-full max-w-sm gap-3">
        @for (provider of openIdProviders; track provider.id) {
          <button
            type="button"
            rbthRainbowBtn
            size="lg"
            class="w-full max-w-sm"
            variant="outline"
            (click)="signInWithOpenId(provider)"
          >
            @if (provider.icon) {
              <ng-icon [name]="provider.icon" class="size-5 shrink-0" />
            } @else {
              <span
                class="flex size-5 items-center justify-center rounded-sm text-xs font-semibold"
                [class]="provider.logoClass"
              >
                {{ provider.logo }}
              </span>
            }
            {{ provider.label }}
          </button>
        }
      </div>

      <div class="my-5 flex w-full max-w-sm items-center gap-3 text-xs uppercase text-muted-foreground">
        <span class="h-px flex-1 bg-border"></span>
        or
        <span class="h-px flex-1 bg-border"></span>
      </div>
    } @else {
      <div class="mt-8"></div>
    }

    <button
      rbthRainbowBtn
      size="lg"
      class="w-full max-w-sm"
      (click)="signIn()"
    >
      <img src="/ic.svg" alt="" class="h-5 w-5" />
      Sign in with Internet Identity
    </button>
  `,
})
export class LoginComponent {
  readonly authService = inject(AUTH_SERVICE);
  #route = inject(ActivatedRoute);
  isDelegation = toSignal(
    this.#route.url.pipe(map((url) => url[0]?.path === 'delegation')),
    { requireSync: true },
  );
  #authConfig = inject(AUTH_CONFIG);
  readonly openIdProviders = normalizeOpenIdProviders(
    this.#authConfig.openIdProviders,
  );
  readonly subtitle =
    this.openIdProviders.length > 0
      ? 'Authenticate with Internet Identity, passkeys, or a trusted OpenID provider.'
      : 'Authenticate with Internet Identity and passkeys.';
  #router = inject(Router);
  #storageCanisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID, {
    optional: true,
  });

  constructor() {
    effect(() => {
      if (!this.isDelegation() && this.authService.isAuthenticated()) {
        const redirectUrl =
          this.#route.snapshot.queryParams['redirectUrl'] || '/dashboard';
        this.#router.navigateByUrl(redirectUrl);
      }
    });
  }

  signIn() {
    this.authService.signIn(
      this.#storageCanisterId ? { target: this.#storageCanisterId } : undefined,
    );
  }

  signInWithOpenId(provider: AuthOpenIdProviderConfig) {
    const options: AuthSignInOptions = provider.issuer
      ? { openIdIssuer: provider.issuer, ...(provider.ssoDomain ? { ssoDomain: provider.ssoDomain } : {}) }
      : { openIdProvider: openIdProviderId(provider) };

    this.authService.signIn({
      ...options,
      ...(this.#storageCanisterId ? { target: this.#storageCanisterId } : {}),
    });
  }
}

const OPEN_ID_PROVIDERS: Record<
  'apple' | 'google' | 'microsoft',
  AuthOpenIdProviderConfig
> = {
  apple: {
    id: 'apple',
    icon: 'hugeApple',
    label: 'Continue with Apple',
  },
  google: {
    id: 'google',
    icon: 'hugeGoogle',
    label: 'Continue with Google',
  },
  microsoft: {
    id: 'microsoft',
    icon: 'hugeMicrosoft',
    label: 'Continue with Microsoft',
  },
};

function normalizeOpenIdProviders(
  providers: (AuthOpenIdProviderConfig | keyof typeof OPEN_ID_PROVIDERS)[] = [
    'google',
    'apple',
    'microsoft',
  ],
): AuthOpenIdProviderConfig[] {
  return providers.map((provider) => {
    if (typeof provider === 'string') return OPEN_ID_PROVIDERS[provider];

    if (provider.id === 'dev' && !provider.issuer) {
      throw new Error('Dev OpenID provider requires an issuer.');
    }

    const builtIn =
      provider.id === 'dev' ? undefined : OPEN_ID_PROVIDERS[provider.id];
    return {
      ...builtIn,
      ...provider,
      icon: provider.icon ?? builtIn?.icon,
      label: provider.label ?? builtIn?.label ?? provider.id,
      logo: provider.logo ?? builtIn?.logo ?? provider.id[0].toUpperCase(),
      logoClass: provider.logoClass ?? builtIn?.logoClass ?? 'bg-muted text-foreground',
    };
  });
}

function openIdProviderId(provider: AuthOpenIdProviderConfig) {
  if (provider.id === 'dev') {
    throw new Error('Dev OpenID provider requires an issuer.');
  }

  return provider.id;
}
