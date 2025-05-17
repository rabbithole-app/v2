import { computed, Directive, input } from '@angular/core';
import { hlm } from '@spartan-ng/brain/core';
import { HlmSeparatorDirective } from '@spartan-ng/ui-separator-helm';
import { ClassValue } from 'clsx';

@Directive({
  selector: '[rbthSidebarSeparator]',
  standalone: true,
  exportAs: 'rbthSidebarSeparator',
  host: {
    '[class]': 'computedClass()',
    'data-sidebar': 'separator',
  },
  hostDirectives: [HlmSeparatorDirective],
})
export class RbthSidebarSeparatorDirective {
  // eslint-disable-next-line @angular-eslint/no-input-rename
  readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly computedClass = computed(() =>
    hlm('bg-sidebar-border mx-2 w-auto', this.userClass())
  );
}
