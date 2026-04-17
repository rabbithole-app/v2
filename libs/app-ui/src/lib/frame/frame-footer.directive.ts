import { computed, Directive, input } from '@angular/core';
import type { ClassValue } from 'clsx';

import { hlm } from '@spartan-ng/helm/utils';

@Directive({
  selector: '[rbthFrameFooter]',
  host: {
    '[class]': '_computedClass()',
    'data-slot': 'frame-footer',
  },
})
export class RbthFrameFooterDirective {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly _computedClass = computed(() =>
    hlm('px-5 py-4', this.userClass())
  );
}
