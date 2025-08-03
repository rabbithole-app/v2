import { computed, Directive, input } from '@angular/core';
import { hlm } from '@spartan-ng/brain/core';
import { HlmSeparator } from '@spartan-ng/helm/separator';
import { ClassValue } from 'clsx';

@Directive({
  selector: '[rbthSidebarSeparator]',
  standalone: true,
  exportAs: 'rbthSidebarSeparator',
  host: {
    '[class]': 'computedClass()',
    'data-sidebar': 'separator',
  },
  hostDirectives: [HlmSeparator],
})
export class RbthSidebarSeparatorDirective {
  readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly computedClass = computed(() =>
    hlm('bg-sidebar-border mx-2 w-auto', this.userClass()),
  );
}
