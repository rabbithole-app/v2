import { computed, Directive, effect, input, untracked } from '@angular/core';
import { injectCustomClassSettable } from '@spartan-ng/brain/core';
import type { ClassValue } from 'clsx';

import { hlm } from '@spartan-ng/helm/utils';

@Directive({
  selector: '[rbthDrawerOverlay]',
  host: {
    '[class]': '_computedClass()',
  },
})
export class RbthDrawerOverlayDirective {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });
  protected _computedClass = computed(() =>
    hlm(
      'bg-overlay backdrop-blur-[10px]',
      // animation
      'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
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
