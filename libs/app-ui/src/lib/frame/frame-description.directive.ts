import { computed, Directive, input } from '@angular/core';
import type { ClassValue } from 'clsx';

import { hlm } from '@spartan-ng/helm/utils';

@Directive({
  selector: '[rbthFrameDescription]',
  host: {
    '[class]': '_computedClass()',
    'data-slot': 'frame-description',
  },
})
export class RbthFrameDescriptionDirective {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly _computedClass = computed(() =>
    hlm('text-muted-foreground text-sm', this.userClass())
  );
}
