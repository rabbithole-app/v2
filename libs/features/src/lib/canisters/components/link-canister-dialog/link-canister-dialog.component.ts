import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Principal } from '@icp-sdk/core/principal';
import {
  BrnDialogClose,
  BrnDialogRef,
  injectBrnDialogContext,
} from '@spartan-ng/brain/dialog';
import { HlmButton } from '@spartan-ng/helm/button';
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from '@spartan-ng/helm/dialog';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { isNonNull } from 'remeda';

import { principalValidator } from '@rabbithole/core';

@Component({
  selector: 'rbth-feat-canisters-link-canister-dialog',
  imports: [
    ReactiveFormsModule,
    BrnDialogClose,
    HlmButton,
    HlmInput,
    HlmLabel,
    HlmDialogHeader,
    HlmDialogFooter,
    HlmDialogTitle,
    HlmDialogDescription,
    HlmSpinner,
  ],
  template: `
    <hlm-dialog-header>
      <h3 hlmDialogTitle>Link Canister</h3>
      <p hlmDialogDescription>
        Enter the Canister ID to link an existing canister to your account.
      </p>
    </hlm-dialog-header>
    <form class="mt-4 space-y-4" [formGroup]="form">
      <div class="space-y-2">
        <label hlmLabel for="canisterId">Canister ID</label>
        <input
          hlmInput
          id="canisterId"
          formControlName="canisterId"
          [attr.aria-invalid]="canisterIdControl.invalid"
          class="aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
          placeholder="Principal ID"
        />
        @if (canisterIdControl.invalid && canisterIdControl.touched) {
          <p class="text-sm text-destructive">
            @if (canisterIdControl.hasError('required')) {
              Canister ID is required.
            } @else if (canisterIdControl.hasError('principal')) {
              Invalid Canister ID format.
            }
          </p>
        }
      </div>
    </form>
    <hlm-dialog-footer class="mt-4">
      <button hlmBtn variant="outline" brnDialogClose [disabled]="isLinking()">
        Cancel
      </button>
      <button
        hlmBtn
        [disabled]="form.invalid || isLinking()"
        (click)="_handleLink()"
      >
        @if (!isLinking()) {
          Confirm
        } @else {
          <hlm-spinner class="size-4" />
          Linking...
        }
      </button>
    </hlm-dialog-footer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LinkCanisterDialogComponent {
  #fb = inject(FormBuilder);
  canisterIdControl = this.#fb.control<string | null>(null, {
    validators: [Validators.required, principalValidator],
  });
  form = this.#fb.nonNullable.group({
    canisterId: this.canisterIdControl,
  });

  #dialogContext = injectBrnDialogContext<{
    action: (canisterId: Principal) => Promise<void>;
    isLinking: Signal<boolean>;
  }>();

  readonly isLinking = this.#dialogContext.isLinking;

  #dialogRef = inject(BrnDialogRef<boolean | undefined>);

  protected async _handleLink() {
    const canisterIdValue = this.form.getRawValue().canisterId;
    if (isNonNull(canisterIdValue) && !this.isLinking()) {
      try {
        const canisterId = Principal.fromText(canisterIdValue);
        await this.#dialogContext?.action(canisterId);
        this.#dialogRef.close(true);
        this.form.reset();
      } catch {
        // Error handling is done in the service
      }
    }
  }
}
