import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { BrnDialogClose, BrnDialogRef } from '@spartan-ng/brain/dialog';
import { HlmButton } from '@spartan-ng/helm/button';
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from '@spartan-ng/helm/dialog';

@Component({
  selector: 'rbth-feat-revoke-allowance-dialog',
  imports: [
    BrnDialogClose,
    HlmButton,
    HlmDialogHeader,
    HlmDialogFooter,
    HlmDialogTitle,
    HlmDialogDescription,
  ],
  template: `
    <hlm-dialog-header>
      <h3 hlmDialogTitle>Revoke Allowance?</h3>
      <p hlmDialogDescription>
        Are you sure you want to revoke this allowance? The spender will no
        longer be able to spend your ICP tokens.
      </p>
    </hlm-dialog-header>
    <hlm-dialog-footer>
      <button hlmBtn variant="outline" brnDialogClose>Cancel</button>
      <button hlmBtn variant="destructive" (click)="_handleRevoke()">
        Revoke
      </button>
    </hlm-dialog-footer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RevokeAllowanceDialogComponent {
  #dialogRef = inject(BrnDialogRef);

  protected _handleRevoke() {
    this.#dialogRef?.close(true);
  }
}
