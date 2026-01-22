import { computed, Directive, input } from '@angular/core';
import { ClassValue } from 'clsx';

import { hlm } from '@spartan-ng/helm/utils';

@Directive({
  selector: '[rbthSidebarGroupContent]',
  exportAs: 'rbthSidebarGroupContent',
  host: {
    '[class]': 'computedClass()',
    'data-sidebar': 'group-content',
  },
})
export class RbthSidebarGroupContentDirective {
  readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly computedClass = computed(() =>
    hlm('w-full text-sm', this.userClass())
  );
}
