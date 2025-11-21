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
  selector: 'shared-remove-controller-dialog',
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
      <h3 hlmDialogTitle>Remove Controller?</h3>
      <p hlmDialogDescription>
        Are you sure you want to remove this controller? This action cannot be
        undone.
      </p>
    </hlm-dialog-header>
    <hlm-dialog-footer>
      <button hlmBtn variant="outline" brnDialogClose>Cancel</button>
      <button hlmBtn variant="destructive" (click)="_handleRemove()">
        Remove
      </button>
    </hlm-dialog-footer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RemoveControllerDialogComponent {
  #dialogRef = inject(BrnDialogRef);

  protected _handleRemove() {
    this.#dialogRef?.close(true);
  }
}
