import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { BrnDialogRef } from '@spartan-ng/brain/dialog';

import { AUTH_SERVICE } from '@rabbithole/auth';
import { CopyToClipboardComponent } from '@rabbithole/ui/copy-to-clipboard';
import { HlmButton } from '@spartan-ng/helm/button';
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from '@spartan-ng/helm/dialog';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmTextarea } from '@spartan-ng/helm/textarea';

export type RequestAccessDialogResult = {
  message?: string;
};

@Component({
  selector: 'rbth-feat-request-access-dialog',
  templateUrl: "./request-access-dialog.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CopyToClipboardComponent,
    HlmButton,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmDialogHeader,
    HlmDialogTitle,
    ...HlmFieldImports,
    HlmTextarea,
    ReactiveFormsModule,
  ],
})
export class RequestAccessDialogComponent {
  readonly dialogRef = inject(BrnDialogRef<RequestAccessDialogResult>);
  readonly messageControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(500)],
  });
  readonly #authService = inject(AUTH_SERVICE);
  readonly principalId = this.#authService.principalId;

  submit(): void {
    if (this.messageControl.invalid) return;
    const message = this.messageControl.value.trim();
    this.dialogRef.close(message ? { message } : {});
  }
}
