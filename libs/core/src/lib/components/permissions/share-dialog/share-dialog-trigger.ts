import { Directive, inject } from '@angular/core';

import { HlmButton } from '@spartan-ng/helm/button';

import { ShareDialogComponent } from './share-dialog.component';

@Directive({
  selector: '[coreShareDialogTrigger]',
  host: {
    '(click)': 'handleClick()',
  },
  hostDirectives: [{ directive: HlmButton, inputs: ['variant', 'size'] }],
})
export class ShareDialogTriggerDirective {
  readonly #shareDialog = inject(ShareDialogComponent);

  handleClick(): void {
    this.#shareDialog.dialog().open();
  }
}
