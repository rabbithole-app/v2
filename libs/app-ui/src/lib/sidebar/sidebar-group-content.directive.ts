import { computed, Directive, input } from '@angular/core';
import { hlm } from '@spartan-ng/brain/core';
import { ClassValue } from 'clsx';

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
