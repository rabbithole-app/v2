import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { CellContext, injectFlexRenderContext } from '@tanstack/angular-table';

import { AUTH_SERVICE } from '@rabbithole/auth';
import { CopyToClipboardComponent } from '@rabbithole/ui';

@Component({
  template: `<rbth-copy-to-clipboard
    [class.font-bold]="isCurrentPrincipal()"
    [content]="value"
  >
    {{ value }}
  </rbth-copy-to-clipboard>`,
  imports: [CopyToClipboardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'contents',
  },
})
export class PrincipalCell<T> {
  readonly context = injectFlexRenderContext<CellContext<T, unknown>>();
  #authService = inject(AUTH_SERVICE);
  isCurrentPrincipal = computed(
    () => this.#authService.principalId() === this.value,
  );

  get value() {
    return this.context.getValue<string>();
  }
}
