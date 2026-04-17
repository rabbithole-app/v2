import { computed, Directive, input } from '@angular/core';
import type { ClassValue } from 'clsx';

import { hlm } from '@spartan-ng/helm/utils';

@Directive({
  selector: '[rbthStepsTitle]',
  host: {
    '[class]': '_computedClass()',
    'data-slot': 'steps-title',
  },
})
export class RbthStepsTitleDirective {
  readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly _computedClass = computed(() =>
    hlm('font-semibold text-sm', this.userClass()),
  );
}
