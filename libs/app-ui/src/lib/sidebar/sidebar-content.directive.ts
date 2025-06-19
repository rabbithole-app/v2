import { computed, Directive, input } from '@angular/core';
import { hlm } from '@spartan-ng/brain/core';
import { ClassValue } from 'clsx';

@Directive({
  selector: '[rbthSidebarContent]',
  exportAs: 'rbthSidebarContent',
  host: {
    '[class]': 'computedClass()',
    'data-sidebar': 'content',
  },
})
export class RbthSidebarContentDirective {
  readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly computedClass = computed(() =>
    hlm(
      'flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden',
      this.userClass()
    )
  );
}
