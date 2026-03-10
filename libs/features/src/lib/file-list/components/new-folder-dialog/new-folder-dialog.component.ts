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

interface NewFolderDialogContext {
  existingNames: string[];
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
  selector: 'rbth-feat-new-folder-dialog',
  template: `
    <hlm-dialog-header>
      <h3 hlmDialogTitle>New folder</h3>
    </hlm-dialog-header>

    <div class="py-4">
      <div hlmField>
        <label hlmFieldLabel for="folder-name-input">Folder name</label>
        <input
          #nameInput
          hlmInput
          id="folder-name-input"
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
            A folder with this name already exists
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
        Create
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
export class NewFolderDialogComponent {
  readonly dialogRef = inject(BrnDialogRef);
  readonly context = injectBrnDialogContext<NewFolderDialogContext>();
  readonly nameControl = new FormControl('', {
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
      this.nameInput()?.nativeElement.focus();
    });
  }

  submit() {
    if (this.nameControl.invalid) return;
    const name = this.nameControl.value.trim();
    if (name) {
      this.dialogRef.close(name);
    }
  }
}
