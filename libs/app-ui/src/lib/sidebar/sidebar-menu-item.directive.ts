import { computed, Directive, input } from '@angular/core';
import { hlm } from '@spartan-ng/brain/core';
import { ClassValue } from 'clsx';

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
