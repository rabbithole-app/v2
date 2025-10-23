import { computed, Directive, input } from '@angular/core';
import { hlm } from '@spartan-ng/helm/utils';
import type { ClassValue } from 'clsx';

@Directive({
  selector: '[rbthDrawerSeparator]',
  host: {
    '[class]': '_computedClass()',
  },
})
export class RbthDrawerSeparatorDirective {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });
  protected _computedClass = computed(() =>
    hlm(
      'relative flex w-full items-center bg-neutral-50 px-5 py-1.5 uppercase text-xs text-neutral-400',
      this.userClass(),
    ),
  );
}
