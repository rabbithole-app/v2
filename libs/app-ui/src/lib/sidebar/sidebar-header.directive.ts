import { computed, Directive, input } from '@angular/core';
import { hlm } from '@spartan-ng/brain/core';
import { ClassValue } from 'clsx';

@Directive({
  selector: '[rbthSidebarHeader]',
  standalone: true,
  exportAs: 'rbthSidebarHeader',
  host: {
    '[class]': 'computedClass()',
    'data-sidebar': 'header',
  },
})
export class RbthSidebarHeaderDirective {
  // eslint-disable-next-line @angular-eslint/no-input-rename
  readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly computedClass = computed(() =>
    hlm('flex flex-col gap-2 p-2', this.userClass())
  );
}
