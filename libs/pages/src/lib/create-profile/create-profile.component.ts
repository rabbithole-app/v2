import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLogOut } from '@ng-icons/lucide';

import { AUTH_SERVICE } from '@rabbithole/auth';
import { AvatarEditorComponent } from '@rabbithole/core';
import { ProfileService } from '@rabbithole/core';
import { HlmButton } from '@spartan-ng/helm/button';
import {
  HlmCard,
  HlmCardContent,
  HlmCardHeader,
  HlmCardTitle,
} from '@spartan-ng/helm/card';
import { HlmError, HlmFormField, HlmHint } from '@spartan-ng/helm/form-field';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

@Component({
  selector: 'page-create-profile',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmCard,
    HlmCardContent,
    HlmCardHeader,
    HlmCardTitle,
    HlmError,
    HlmFormField,
    HlmHint,
    HlmIcon,
    HlmInput,
    HlmLabel,
    NgIcon,
    HlmSpinner,
    AvatarEditorComponent,
  ],
  providers: [provideIcons({ lucideLogOut })],
  templateUrl: './create-profile.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'relative grid min-h-dvh w-full place-items-center overflow-hidden p-4 before:absolute before:start-1/2 before:top-0 before:-z-[1] before:size-full before:-translate-x-1/2 before:transform before:bg-[url(/squared-bg-element.svg)] before:bg-center before:bg-no-repeat dark:before:bg-[url(/squared-bg-element.svg)]',
  },
})
export class CreateProfileComponent {
  readonly authService = inject(AUTH_SERVICE);
  readonly #fb = inject(FormBuilder);
  readonly #profileService = inject(ProfileService);
  usernameControl = this.#fb.nonNullable.control<string | null>(null, {
    validators: Validators.compose([
      Validators.required,
      Validators.minLength(2),
      Validators.maxLength(20),
      Validators.pattern('[a-zA-Z0-9_]+'),
    ]),
    asyncValidators: [this.#profileService.checkUsernameValidator()],
  });

  readonly form = this.#fb.group({
    avatarUrl: this.#fb.control<string | null>(null),
    username: this.usernameControl,
    displayName: this.#fb.control<string | null>(null),
  });
  readonly loading = signal(false);
  readonly profileReady = toSignal(this.#profileService.ready$, {
    initialValue: false,
  });
  readonly #router = inject(Router);

  constructor() {
    effect(() => {
      const profile = this.#profileService.profile();
      const ready = this.profileReady();
      const authenticated = this.authService.isAuthenticated();
      if (ready && profile && authenticated) {
        this.#router.navigate(['/']);
      } else if (ready && !authenticated) {
        this.#router.navigate(['/login']);
      }
    });
  }

  async handleSubmit() {
    if (this.form.invalid || this.loading()) {
      return;
    }

    const formValue = this.form.getRawValue();
    const { username, displayName, avatarUrl } = formValue;

    if (!username) return;

    try {
      this.loading.set(true);
      await this.#profileService.createProfile({
        username,
        displayName: displayName ? [displayName] : [],
        avatarUrl: avatarUrl ? [avatarUrl] : [],
        inviter: [],
      });
    } finally {
      this.loading.set(false);
    }
  }
}
