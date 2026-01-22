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
import {
  ENCRYPTED_STORAGE_CANISTER_ID,
  LoginWrapperComponent,
} from '@rabbithole/core';

@Component({
  selector: 'page-login',
  imports: [LoginWrapperComponent],
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,

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
