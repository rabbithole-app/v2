import { computed, Directive, input } from '@angular/core';
import { ClassValue } from 'clsx';

import { hlm } from '@spartan-ng/helm/utils';

@Directive({
  selector: 'input[rbthSidebarInput]',
  exportAs: 'rbthSidebarInput',
  host: {
    '[class]': 'computedClass()',
    'data-sidebar': 'input',
  },
})
export class RbthSidebarInputDirective {
  readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly computedClass = computed(() =>
    hlm('bg-background h-8 w-full shadow-none', this.userClass())
  );
}
