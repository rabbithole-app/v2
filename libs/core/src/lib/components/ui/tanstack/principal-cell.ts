import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CellContext, injectFlexRenderContext } from '@tanstack/angular-table';

import { CopyToClipboardComponent } from '../copy-to-clipboard';

@Component({
  template: `<core-copy-to-clipboard
    [class.font-bold]="isBold()"
    [content]="value"
  >
    {{ value }}
  </core-copy-to-clipboard>`,
  imports: [CopyToClipboardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'contents',
  },
})
export class PrincipalCell<T> {
  readonly context = injectFlexRenderContext<CellContext<T, unknown>>();
  isBold = input(false);

  get value() {
    return this.context.getValue<string>();
  }
}
