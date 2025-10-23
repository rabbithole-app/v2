import { computed, Directive, input } from '@angular/core';
import { hlm } from '@spartan-ng/helm/utils';
import type { ClassValue } from 'clsx';

@Directive({
  selector: '[rbthProgress],brn-progress[rbth]',
  host: {
    '[class]': '_computedClass()',
  },
})
export class RbthProgressDirective {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });
  protected readonly _computedClass = computed(() =>
    hlm(
      'bg-primary/20 relative h-2 w-full overflow-hidden rounded-full',
      this.userClass()
    )
  );
}
