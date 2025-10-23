import { computed, Directive, input } from '@angular/core';
import { hlm } from '@spartan-ng/helm/utils';
import { ClassValue } from 'clsx';

@Directive({
  selector: 'ul[rbthSidebarMenu]',
  exportAs: 'rbthSidebarMenu',
  host: {
    '[class]': 'computedClass()',
    'data-sidebar': 'menu',
  },
})
export class RbthSidebarMenuDirective {
  readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly computedClass = computed(() =>
    hlm('flex w-full min-w-0 flex-col gap-1', this.userClass())
  );
}
