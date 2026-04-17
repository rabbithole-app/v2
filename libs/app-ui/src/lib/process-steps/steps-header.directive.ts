import { computed, Directive, input } from '@angular/core';
import type { ClassValue } from 'clsx';

import { hlm } from '@spartan-ng/helm/utils';

@Directive({
  selector: '[rbthStepsHeader]',
  host: {
    '[class]': '_computedClass()',
    'data-slot': 'steps-header',
  },
})
export class RbthStepsHeaderDirective {
  readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly _computedClass = computed(() =>
    hlm('flex flex-col px-5 py-4', this.userClass()),
  );
}
