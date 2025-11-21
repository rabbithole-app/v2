import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Principal } from '@dfinity/principal';
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
import { isNonNull } from 'remeda';

import { principalValidator } from '@rabbithole/core';

@Component({
  selector: 'shared-add-controller-dialog',
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
  ],
  template: `
    <hlm-dialog-header>
      <h3 hlmDialogTitle>Add Controller</h3>
      <p hlmDialogDescription>
        Enter the Principal ID of the controller to add.
      </p>
    </hlm-dialog-header>
    <form class="mt-4 space-y-4" [formGroup]="form">
      <div class="space-y-2">
        <label hlmLabel for="principal">Principal ID</label>
        <input
          hlmInput
          id="principal"
          formControlName="principal"
          [attr.aria-invalid]="principalControl.invalid"
          class="aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
          placeholder="Enter Principal ID"
        />
        @if (principalControl.invalid && principalControl.touched) {
          <p class="text-sm text-destructive">
            @if (principalControl.hasError('required')) {
              Principal ID is required.
            } @else if (principalControl.hasError('principal')) {
              Invalid Principal ID format.
            } @else if (principalControl.hasError('duplicate')) {
              This controller already exists.
            }
          </p>
        }
      </div>
    </form>
    <hlm-dialog-footer class="mt-4">
      <button hlmBtn variant="outline" brnDialogClose>Cancel</button>
      <button hlmBtn [disabled]="form.invalid" (click)="_handleAdd()">
        Add
      </button>
    </hlm-dialog-footer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddControllerDialogComponent {
  #fb = inject(FormBuilder);
  principalControl = this.#fb.control<string | null>(null, {
    validators: [Validators.required, principalValidator],
  });
  form = this.#fb.nonNullable.group({
    principal: this.principalControl,
  });

  #dialogContext = injectBrnDialogContext<{
    controllers: Principal[];
  }>();

  #dialogRef = inject(BrnDialogRef);

  constructor() {
    this.principalControl.addValidators(
      this._uniquePrincipalValidator.bind(this),
    );
  }

  protected _handleAdd() {
    const principalValue = this.form.getRawValue().principal;
    if (isNonNull(principalValue)) {
      try {
        const principal = Principal.fromText(principalValue);
        this.#dialogRef?.close(principal);
        this.form.reset();
      } catch {
        // Invalid principal, form validation should handle this
      }
    }
  }

  protected _uniquePrincipalValidator(control: { value: string | null }) {
    const value = control.value;
    if (!value) return null;

    const controllers = this.#dialogContext?.controllers ?? [];

    try {
      const principal = Principal.fromText(value);
      const exists = controllers.some(
        (ctrl) => ctrl.toText() === principal.toText(),
      );
      return exists ? { duplicate: true } : null;
    } catch {
      return null;
    }
  }
}
