import { computed, Directive, input } from '@angular/core';
import type { ClassValue } from 'clsx';

import { hlm } from '@spartan-ng/helm/utils';

@Directive({
  selector: '[rbthFrameHeader]',
  host: {
    '[class]': '_computedClass()',
    'data-slot': 'frame-header',
  },
})
export class RbthFrameHeaderDirective {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly _computedClass = computed(() =>
    hlm('flex flex-col px-5 py-4', this.userClass())
  );
}
