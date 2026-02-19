import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { BrnDialogImports } from '@spartan-ng/brain/dialog';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';

@Component({
  selector: 'rbth-feat-top-up-dialog',
  template: `
    <hlm-dialog-header>
      <h3 hlmDialogTitle>Top Up Storage</h3>
      <p hlmDialogDescription>
        Payment integration coming soon. This will allow you to top up your
        storage with ICP or ckUSDC.
      </p>
    </hlm-dialog-header>
    <div class="py-4">
      <p class="text-muted-foreground text-sm">
        ICPay integration is in progress. You will be able to top up your storage
        balance directly from this dialog.
      </p>
    </div>
    <hlm-dialog-footer>
      <button hlmBtn variant="outline" brnDialogClose>Close</button>
    </hlm-dialog-footer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [...HlmButtonImports, ...BrnDialogImports, ...HlmDialogImports],
})
export class TopUpDialogComponent {}
