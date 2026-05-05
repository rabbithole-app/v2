import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import {
  AbstractControl,
  FormControl,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';

import { HlmButton } from '@spartan-ng/helm/button';
import {
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from '@spartan-ng/helm/dialog';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInput } from '@spartan-ng/helm/input';

import { NodeItem } from '../../types';

interface RenameDialogContext {
  existingNames: string[];
  item: NodeItem;
}

function duplicateNameValidator(
  existingNames: string[],
): (control: AbstractControl) => ValidationErrors | null {
  return (control: AbstractControl) => {
    const value = control.value?.trim();
    if (value && existingNames.includes(value)) {
      return { duplicateName: true };
    }
    return null;
  };
}

@Component({
  selector: 'rbth-feat-rename-dialog',
  template: `
    <hlm-dialog-header>
      <h3 hlmDialogTitle>Rename</h3>
    </hlm-dialog-header>

    <div class="py-4">
      <div hlmField>
        <label hlmFieldLabel for="rename-input">Name</label>
        <input
          #nameInput
          hlmInput
          id="rename-input"
          [formControl]="nameControl"
          (keydown.enter)="submit()"
          class="w-full"
        />
        @if (nameControl.hasError('required')) {
          <p hlmFieldHint class="text-destructive">Name is required</p>
        }
        @if (nameControl.hasError('pattern')) {
          <p hlmFieldHint class="text-destructive">
            Name cannot contain "/"
          </p>
        }
        @if (nameControl.hasError('duplicateName')) {
          <p hlmFieldHint class="text-destructive">
            An item with this name already exists
          </p>
        }
      </div>
    </div>

    <hlm-dialog-footer>
      <button hlmBtn variant="outline" (click)="dialogRef.close()">
        Cancel
      </button>
      <button
        hlmBtn
        [disabled]="nameControl.invalid"
        (click)="submit()"
      >
        Rename
      </button>
    </hlm-dialog-footer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmDialogFooter,
    HlmButton,
    HlmFieldImports,
    HlmInput,
  ],
})
export class RenameDialogComponent {
  readonly context = injectBrnDialogContext<RenameDialogContext>();
  readonly dialogRef = inject(BrnDialogRef);
  readonly item = this.context.item;
  readonly nameControl = new FormControl(this.item.name, {
    nonNullable: true,
    validators: [
      Validators.required,
      Validators.maxLength(255),
      Validators.pattern(/^[^/]+$/),
      duplicateNameValidator(this.context.existingNames),
    ],
  });
  readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  constructor() {
    afterNextRender(() => {
      const input = this.nameInput()?.nativeElement;
      if (!input) return;
      input.focus();
      // Select name without extension for files
      const dotIndex = this.item.name.lastIndexOf('.');
      if (this.item.type === 'file' && dotIndex > 0) {
        input.setSelectionRange(0, dotIndex);
      } else {
        input.select();
      }
    });
  }

  submit() {
    if (this.nameControl.invalid) return;
    const newName = this.nameControl.value.trim();
    if (newName && newName !== this.item.name) {
      this.dialogRef.close(newName);
    } else {
      this.dialogRef.close();
    }
  }
}
