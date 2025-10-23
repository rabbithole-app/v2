import { computed, Directive, input } from '@angular/core';
import { hlm } from '@spartan-ng/helm/utils';
import { BrnSheetTitle } from '@spartan-ng/brain/sheet';
import type { ClassValue } from 'clsx';

@Directive({
  selector: '[rbthDrawerTitle]',
  host: {
    '[class]': '_computedClass()',
  },
  hostDirectives: [BrnSheetTitle],
})
export class RbthDrawerTitleDirective {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });
  protected _computedClass = computed(() =>
    hlm('flex-1 text-lg font-semibold flex flex-col gap-1', this.userClass()),
  );
}
