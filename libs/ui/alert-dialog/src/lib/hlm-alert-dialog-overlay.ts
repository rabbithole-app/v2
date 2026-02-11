import { computed, Directive, effect, input, untracked } from '@angular/core';
import { BrnAlertDialogOverlay } from '@spartan-ng/brain/alert-dialog';
import { injectCustomClassSettable } from '@spartan-ng/brain/core';
import type { ClassValue } from 'clsx';

import { hlm } from '@spartan-ng/helm/utils';

@Directive({
  selector: '[hlmAlertDialogOverlay],hlm-alert-dialog-overlay',
  hostDirectives: [BrnAlertDialogOverlay],
})
export class HlmAlertDialogOverlay {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly _computedClass = computed(() =>
    hlm(
      'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 bg-black/50',
      this.userClass(),
    ),
  );
  private readonly _classSettable = injectCustomClassSettable({
    optional: true,
    host: true,
  });

  constructor() {
    effect(() => {
      const classValue = this._computedClass();
      untracked(() => this._classSettable?.setClassToCustomElement(classValue));
    });
  }
}
