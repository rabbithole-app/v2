import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

import { AUTH_SERVICE } from '@rabbithole/auth';
import { ENCRYPTED_STORAGE_CANISTER_ID } from '@rabbithole/core';
import { RbthRainbowButton } from '@rabbithole/ui';

@Component({
  selector: 'rbth-page-login',
  imports: [RbthRainbowButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative z-10 flex min-h-[calc(100dvh-3.5rem)] flex-col items-center justify-center px-4 py-12',
  },
  template: `
    <h1 class="text-center text-3xl font-bold tracking-tight sm:text-4xl">
      Sign in to Rabbithole
    </h1>
    <p class="mx-auto mt-3 max-w-sm text-center text-muted-foreground">
      Authenticate with Internet Identity — no passwords, just passkeys.
    </p>

    <button
      rbthRainbowBtn
      size="lg"
      class="mt-8"
      (click)="signIn()"
    >
      <img src="/ic.svg" alt="" class="h-5 w-5" />
      Sign in with Internet Identity
    </button>
  `,
})
export class LoginComponent {
  authService = inject(AUTH_SERVICE);
  #route = inject(ActivatedRoute);
  isDelegation = toSignal(
    this.#route.url.pipe(map((url) => url[0]?.path === 'delegation')),
    { requireSync: true },
  );
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
}
