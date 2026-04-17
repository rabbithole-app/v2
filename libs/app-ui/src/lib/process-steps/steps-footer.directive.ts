import { computed, Directive, input } from '@angular/core';
import type { ClassValue } from 'clsx';

import { hlm } from '@spartan-ng/helm/utils';

@Directive({
  selector: '[rbthStepsFooter]',
  host: {
    '[class]': '_computedClass()',
    'data-slot': 'steps-footer',
  },
})
export class RbthStepsFooterDirective {
  readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly _computedClass = computed(() =>
    hlm('px-5 py-4', this.userClass()),
  );
}
