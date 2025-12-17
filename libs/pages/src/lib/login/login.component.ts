import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideDownload, lucideGithub } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { isTauri } from '@tauri-apps/api/core';
import { map } from 'rxjs';

import { AUTH_SERVICE } from '@rabbithole/auth';
import {
  APP_NAME_TOKEN,
  ENCRYPTED_STORAGE_CANISTER_ID,
} from '@rabbithole/core';

@Component({
  selector: 'page-login',
  imports: [NgIcon, HlmButton, HlmIcon],
  providers: [provideIcons({ lucideGithub, lucideDownload })],
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'relative grid h-dvh w-full place-items-center overflow-hidden before:absolute before:start-1/2 before:top-0 before:-z-[1] before:size-full before:-translate-x-1/2 before:transform before:bg-[url(/squared-bg-element.svg)] before:bg-center before:bg-no-repeat dark:before:bg-[url(/squared-bg-element.svg)]',
  },
})
export class LoginComponent {
  readonly appName = inject(APP_NAME_TOKEN);
  authService = inject(AUTH_SERVICE);
  #route = inject(ActivatedRoute);
  isDelegation = toSignal(
    this.#route.url.pipe(map((url) => url[0]?.path === 'delegation')),
    { requireSync: true },
  );
  readonly isTauri = isTauri();
  #router = inject(Router);
  #storageCanisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID, {
    optional: true,
  });

  constructor() {
    effect(() => {
      if (!this.isDelegation() && this.authService.isAuthenticated()) {
        this.#router.navigate(['/']);
      }
    });
  }

  signIn() {
    this.authService.signIn(
      this.#storageCanisterId ? { target: this.#storageCanisterId } : undefined,
    );
  }
}
