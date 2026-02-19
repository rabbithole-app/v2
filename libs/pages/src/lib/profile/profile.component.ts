import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  applyWhen,
  form,
  FormField,
  maxLength,
  minLength,
  pattern,
  readonly,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import { debounceTime, distinctUntilChanged, filter, from, of, switchMap } from 'rxjs';

import { injectMainActor, ProfileService } from '@rabbithole/core';
import { AvatarEditorComponent } from '@rabbithole/core';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmFormField, HlmHint } from '@spartan-ng/helm/form-field';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

interface ProfileFormData {
  avatarUrl: string | null;
  displayName: string | null;
  username: string;
}

@Component({
  selector: 'page-profile',
  imports: [
    FormField,
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
  readonly #profileService = inject(ProfileService);
  readonly profile = this.#profileService.profile;
  readonly isEditMode = computed(() => !!this.profile());
  readonly loading = signal(false);
  readonly model = signal<ProfileFormData>({
    avatarUrl: null,
    username: '',
    displayName: null,
  });

  /** Async username check result — null = not checked, true = taken, false = available */
  readonly usernameTaken = signal<boolean | null>(null);
  readonly profileForm = form(this.model, (s) => {
    // Username validation only in create mode
    applyWhen(s.username, () => !this.isEditMode(), (s2) => {
      required(s2, { message: 'Username is required' });
      minLength(s2, 2, { message: 'At least 2 characters' });
      maxLength(s2, 20, { message: 'Max 20 characters' });
      pattern(s2, /^[a-zA-Z0-9_]+$/, {
        message: 'Only letters, numbers and underscores',
      });

      // Sync validator that reads async check result
      validate(s2, () => {
        const taken = this.usernameTaken();
        if (taken === true) {
          return { kind: 'usernameExists', message: 'This username is already taken' };
        }
        return null;
      });
    });

    // Username readonly in edit mode
    readonly(s.username, () => this.isEditMode());
  });

  readonly profileReady = toSignal(this.#profileService.ready$, {
    initialValue: false,
  });
  readonly usernameChecking = signal(false);
  readonly #actor = injectMainActor();

  readonly #destroyRef = inject(DestroyRef);

  constructor() {
    // Sync profile data into model (runs once when profile loads)
    effect(() => {
      const p = this.profile();
      if (p) {
        untracked(() => {
          this.model.set({
            avatarUrl: p.avatarUrl[0] ?? null,
            username: p.username,
            displayName: p.displayName[0] ?? null,
          });
        });
      }
    });

    // Debounced async username check via RxJS
    const usernameValue = computed(() => this.profileForm.username().value());
    const usernameValue$ = toObservable(usernameValue);

    usernameValue$.pipe(
      filter(() => !this.isEditMode()),
      debounceTime(500),
      distinctUntilChanged(),
      switchMap((username) => {
        this.usernameTaken.set(null);

        if (!username || this.profileForm.username().invalid()) {
          return of(null);
        }

        this.usernameChecking.set(true);
        return from(this.#actor().usernameExists(username));
      }),
      takeUntilDestroyed(this.#destroyRef),
    ).subscribe((taken) => {
      this.usernameTaken.set(taken);
      this.usernameChecking.set(false);
    });
  }

  handleSubmit(event: Event) {
    event.preventDefault();

    if (this.isEditMode()) {
      submit(this.profileForm, () => this.#update());
    } else {
      submit(this.profileForm, () => this.#create());
    }
  }

  async #create() {
    if (this.loading()) return;
    const { username, displayName, avatarUrl } = this.model();
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

  async #update() {
    if (this.loading()) return;
    const { displayName, avatarUrl } = this.model();

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
