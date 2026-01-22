import { computed, Directive, input } from '@angular/core';
import { ClassValue } from 'clsx';

import { hlm } from '@spartan-ng/helm/utils';

@Directive({
  selector: 'li[rbthSidebarMenuItem]',
  exportAs: 'rbthSidebarMenuItem',
  host: {
    '[class]': 'computedClass()',
    'data-sidebar': 'menu-item',
  },
})
export class RbthSidebarMenuItemDirective {
  readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly computedClass = computed(() =>
    hlm('group/menu-item relative', this.userClass())
  );
}
