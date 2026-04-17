import { computed, Directive, input } from '@angular/core';
import type { ClassValue } from 'clsx';

import { hlm } from '@spartan-ng/helm/utils';

@Directive({
  selector: '[rbthFrameTitle]',
  host: {
    '[class]': '_computedClass()',
    'data-slot': 'frame-title',
  },
})
export class RbthFrameTitleDirective {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly _computedClass = computed(() =>
    hlm('font-semibold text-sm', this.userClass())
  );
}
