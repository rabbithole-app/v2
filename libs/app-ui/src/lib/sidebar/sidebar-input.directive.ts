import { computed, Directive, input } from '@angular/core';
import { hlm } from '@spartan-ng/brain/core';
import { ClassValue } from 'clsx';

@Directive({
  selector: 'input[rbthSidebarInput]',
  standalone: true,
  exportAs: 'rbthSidebarInput',
  host: {
    '[class]': 'computedClass()',
    'data-sidebar': 'input',
  },
})
export class RbthSidebarInputDirective {
  // eslint-disable-next-line @angular-eslint/no-input-rename
  readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly computedClass = computed(() =>
    hlm('bg-background h-8 w-full shadow-none', this.userClass())
  );
}
