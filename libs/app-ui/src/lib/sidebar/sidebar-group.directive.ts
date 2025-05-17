import { computed, Directive, input } from '@angular/core';
import { hlm } from '@spartan-ng/brain/core';
import { ClassValue } from 'clsx';

@Directive({
  selector: '[rbthSidebarGroup]',
  standalone: true,
  exportAs: 'rbthSidebarGroup',
  host: {
    '[class]': 'computedClass()',
    'data-sidebar': 'group',
  },
})
export class RbthSidebarGroupDirective {
  // eslint-disable-next-line @angular-eslint/no-input-rename
  readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly computedClass = computed(() =>
    hlm('relative flex w-full min-w-0 flex-col p-2', this.userClass())
  );
}
