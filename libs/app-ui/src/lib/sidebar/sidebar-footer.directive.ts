import { computed, Directive, input } from '@angular/core';
import { hlm } from '@spartan-ng/helm/utils';
import { ClassValue } from 'clsx';

@Directive({
  selector: '[rbthSidebarFooter]',
  exportAs: 'rbthSidebarFooter',
  host: {
    '[class]': 'computedClass()',
    'data-sidebar': 'footer',
  },
})
export class RbthSidebarFooterDirective {
  readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly computedClass = computed(() =>
    hlm('flex flex-col gap-2 p-2', this.userClass())
  );
}
