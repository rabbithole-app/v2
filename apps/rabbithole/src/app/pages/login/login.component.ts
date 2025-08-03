import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideDownload, lucideGithub } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { isTauri } from '@tauri-apps/api/core';

import { environment } from '../../../environments/environment';
import { DelegationComponent } from '../delegation/delegation.component';
import { AUTH_SERVICE } from '@rabbithole/auth';

@Component({
  selector: 'app-login',
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
  readonly appName = environment.appName;
  authService = inject(AUTH_SERVICE);
  readonly isTauri = isTauri();
  #delegationRef = inject(DelegationComponent, {
    optional: true,
  });
  #router = inject(Router);

  constructor() {
    effect(() => {
      if (!this.#delegationRef && this.authService.isAuthenticated()) {
        this.#router.navigate(['/']);
      }
    });
  }
}
