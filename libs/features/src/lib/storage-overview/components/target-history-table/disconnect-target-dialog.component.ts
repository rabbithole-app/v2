import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { BrnDialogClose, BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';

import { HlmButton } from '@spartan-ng/helm/button';
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from '@spartan-ng/helm/dialog';

@Component({
  selector: 'rbth-feat-disconnect-target-dialog',
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
      <h3 hlmDialogTitle>Disconnect {{ _targetLabel }}?</h3>
      <p hlmDialogDescription>
        The target and its stored credentials are removed from the canister.
        The bucket itself is not touched. You can connect it again later.
      </p>
    </hlm-dialog-header>
    <hlm-dialog-footer>
      <button hlmBtn variant="outline" brnDialogClose>Cancel</button>
      <button hlmBtn variant="destructive" (click)="_confirm()">
        Disconnect
      </button>
    </hlm-dialog-footer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DisconnectTargetDialogComponent {
  readonly #context = injectBrnDialogContext<{ targetLabel: string }>();
  protected readonly _targetLabel = this.#context.targetLabel;

  readonly #dialogRef = inject(BrnDialogRef);

  protected _confirm() {
    this.#dialogRef?.close(true);
  }
}
