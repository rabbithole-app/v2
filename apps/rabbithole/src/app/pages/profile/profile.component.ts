import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmFormField, HlmHint } from '@spartan-ng/helm/form-field';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

import { ProfileService } from '@rabbithole/core';
import { AvatarEditorComponent } from '@rabbithole/core';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmFormField,
    HlmHint,
    HlmInput,
    HlmLabel,
    HlmSpinner,
    AvatarEditorComponent,
  ],
  templateUrl: './profile.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent {
  readonly deleting = signal(false);
  readonly #fb = inject(FormBuilder);
  readonly form = this.#fb.group({
    avatarUrl: this.#fb.control<string | null>(null),
    displayName: this.#fb.control<string | null>(null),
  });

  readonly loading = signal(false);
  readonly #profileService = inject(ProfileService);
  readonly profile = this.#profileService.profile;
  readonly profileReady = toSignal(this.#profileService.ready$, {
    initialValue: false,
  });
  readonly #router = inject(Router);

  constructor() {
    // Load profile data into form
    effect(() => {
      const profile = this.#profileService.profile();
      const ready = this.profileReady();
      if (profile) {
        this.form.patchValue({
          avatarUrl: profile.avatarUrl[0] ?? null,
          displayName: profile.displayName[0] ?? null,
        });
      } else if (ready) {
        this.#router.navigate(['/create-profile']);
      }
    });
  }

  async handleDelete() {
    if (this.deleting()) {
      return;
    }

    try {
      this.deleting.set(true);
      await this.#profileService.deleteProfile();
    } finally {
      this.deleting.set(false);
    }
  }

  async handleSubmit() {
    if (this.form.invalid || this.loading()) {
      return;
    }

    const formValue = this.form.getRawValue();
    const { displayName, avatarUrl } = formValue;

    try {
      this.loading.set(true);
      await this.#profileService.updateProfile({
        displayName: displayName ? [displayName] : [],
        avatarUrl: avatarUrl ? [avatarUrl] : [],
      });
    } finally {
      this.loading.set(false);
    }
  }
}
