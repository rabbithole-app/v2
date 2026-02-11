import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { provideIcons } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';
import { BrnDialogClose, BrnDialogRef } from '@spartan-ng/brain/dialog';

import { isPrincipal } from '@rabbithole/core';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDatePickerImports } from '@spartan-ng/helm/date-picker';
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from '@spartan-ng/helm/dialog';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmIconImports } from '@spartan-ng/helm/icon';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmInputGroupImports } from '@spartan-ng/helm/input-group';

export interface AddAllowanceData {
  amount: bigint;
  expiresAt?: Date;
  spenderId: string;
}


interface AddAllowanceFormModel {
  amount: number | string;
  expiresAt: number | string;
  spenderId: string;
}

@Component({
  selector: 'rbth-feat-add-allowance-dialog',
  imports: [
    FormField,
    BrnDialogClose,
    HlmButton,
    HlmInput,
    HlmDialogHeader,
    HlmDialogFooter,
    HlmDialogTitle,
    HlmDialogDescription,
    ...HlmFieldImports,
    ...HlmDatePickerImports,
    ...HlmInputGroupImports,
    ...HlmIconImports,
  ],
  providers: [provideIcons({ lucideX })],
  templateUrl: './add-allowance-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddAllowanceDialogComponent {
  protected readonly _selectedDate = signal<Date | undefined>(undefined);

  protected readonly formModel = signal<AddAllowanceFormModel>({
    amount: '',
    expiresAt: '',
    spenderId: '',
  });

  protected readonly allowanceForm = form(this.formModel, (schema) => {
    required(schema.spenderId, { message: 'Spender ID is required.' });
    required(schema.amount, { message: 'Amount is required.' });
  });

  protected readonly amountError = computed(() => {
    const field = this.allowanceForm.amount();
    if (!field.touched()) return null;

    const value = field.value();
    if (!value) return 'Amount is required.';
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numValue) || numValue < 0.00000001)
      return 'Amount must be at least 0.00000001 ICP (1 e8s).';
    return null;
  });

  // Custom validation for Principal ID
  protected readonly spenderIdError = computed(() => {
    const field = this.allowanceForm.spenderId();
    if (!field.touched()) return null;

    const value = field.value();
    if (!value) return 'Spender ID is required.';

    if (!isPrincipal(value)) {
      return 'Invalid Principal ID format.';
    }

    return null;
  });

  protected readonly isFormValid = computed(() => {
    const spenderIdValid = !this.spenderIdError();
    const amountValid = !this.amountError();
    return spenderIdValid && amountValid;
  });

  protected readonly isSubmitDisabled = computed(() => !this.isFormValid());

  // Minimum date is tomorrow (cannot set expiration in the past or today)
  protected readonly minDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

  #dialogRef = inject(BrnDialogRef);

  protected _handleAdd() {
    if (!this.isFormValid()) return;

    const formData = this.formModel();
    const spenderIdValue = formData.spenderId;
    const amountValue = formData.amount;

    if (!spenderIdValue || !amountValue) return;

    // Validate that it's a valid Principal ID
    if (!isPrincipal(spenderIdValue)) return;

    // Convert amount to number
    const amountNum =
      typeof amountValue === 'string' ? parseFloat(amountValue) : amountValue;
    if (isNaN(amountNum)) return;

    // Convert ICP to e8s (1 ICP = 100_000_000 e8s)
    const amountE8s = BigInt(Math.floor(amountNum * 100_000_000));

    // Use the selected date from signal
    const expiresAtDate = this._selectedDate();

    // Close dialog with data
    this.#dialogRef?.close({
      spenderId: spenderIdValue,
      amount: amountE8s,
      expiresAt: expiresAtDate,
    });
  }

  protected _onClearDate() {
    this._selectedDate.set(undefined);
  }

  protected _onDateChange(date: Date | undefined) {
    this._selectedDate.set(date);
  }
}
