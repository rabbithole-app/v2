import { computed, Directive, input } from '@angular/core';
import { hlm } from '@spartan-ng/brain/core';
import { ClassValue } from 'clsx';

@Directive({
  selector: '[rbthSidebarFooter]',
  standalone: true,
  exportAs: 'rbthSidebarFooter',
  host: {
    '[class]': 'computedClass()',
    'data-sidebar': 'footer',
  },
})
export class RbthSidebarFooterDirective {
  // eslint-disable-next-line @angular-eslint/no-input-rename
  readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly computedClass = computed(() =>
    hlm('flex flex-col gap-2 p-2', this.userClass())
  );
}
