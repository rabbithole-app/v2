import { computed, Directive, input } from '@angular/core';
import { ClassValue } from 'clsx';

import { hlm } from '@spartan-ng/helm/utils';

@Directive({
  selector: '[rbthSidebarHeader]',
  exportAs: 'rbthSidebarHeader',
  host: {
    '[class]': 'computedClass()',
    'data-sidebar': 'header',
  },
})
export class RbthSidebarHeaderDirective {
  readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly computedClass = computed(() =>
    hlm('flex flex-col gap-2 p-2', this.userClass())
  );
}
