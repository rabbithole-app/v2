import { computed, Directive, input } from '@angular/core';
import { hlm } from '@spartan-ng/brain/core';
import { ClassValue } from 'clsx';

@Directive({
  selector: 'ul[rbthSidebarMenu]',
  standalone: true,
  exportAs: 'rbthSidebarMenu',
  host: {
    '[class]': 'computedClass()',
    'data-sidebar': 'menu',
  },
})
export class RbthSidebarMenuDirective {
  // eslint-disable-next-line @angular-eslint/no-input-rename
  readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly computedClass = computed(() =>
    hlm('flex w-full min-w-0 flex-col gap-1', this.userClass())
  );
}
