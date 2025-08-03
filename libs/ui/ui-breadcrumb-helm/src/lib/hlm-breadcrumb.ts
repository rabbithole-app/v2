import { computed, Directive, input } from '@angular/core';
import { hlm } from '@spartan-ng/brain/core';
import type { ClassValue } from 'clsx';

@Directive({
  selector: '[hlmBreadcrumb]',
  host: {
    role: 'navigation',
    '[class]': '_computedClass()',
    '[attr.aria-label]': 'ariaLabel()',
  },
})
export class HlmBreadcrumb {
  public readonly ariaLabel = input<string>('breadcrumb', {
    alias: 'aria-label',
  });
  public readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly _computedClass = computed(() => hlm(this.userClass()));
}
