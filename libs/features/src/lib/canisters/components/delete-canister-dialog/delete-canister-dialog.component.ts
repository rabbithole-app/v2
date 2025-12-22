import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
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

@Component({
  selector: 'rbth-feat-canisters-delete-canister-dialog',
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
      <h3 hlmDialogTitle>Delete Canister</h3>
      <p hlmDialogDescription>
        Are you sure you want to remove this canister from your list? This
        action will not delete the canister itself, only remove it from your
        account.
      </p>
    </hlm-dialog-header>
    <hlm-dialog-footer class="mt-4">
      <button hlmBtn variant="outline" brnDialogClose>Cancel</button>
      <button hlmBtn variant="destructive" (click)="_onConfirm()">
        Delete
      </button>
    </hlm-dialog-footer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeleteCanisterDialogComponent {
  #dialogContext = injectBrnDialogContext<{
    action: () => Promise<void>;
  }>();

  #dialogRef = inject(BrnDialogRef<boolean | undefined>);

  protected async _onConfirm() {
    await this.#dialogContext?.action();
    this.#dialogRef.close(true);
  }
}
