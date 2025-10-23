import { computed, Directive, input } from '@angular/core';
import { hlm } from '@spartan-ng/helm/utils';
import { ClassValue } from 'clsx';

@Directive({
  selector: '[rbthSidebarHeader]',
  exportAs: 'rbthSidebarHeader',
  host: {
    '[class]': 'computedClass()',
    'data-sidebar': 'header',
  },
})
export class RbthSidebarHeaderDirective {
  readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly computedClass = computed(() =>
    hlm('flex flex-col gap-2 p-2', this.userClass())
  );
}
