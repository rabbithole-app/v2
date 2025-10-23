import { computed, Directive, input } from '@angular/core';
import { hlm } from '@spartan-ng/helm/utils';
import { BrnSheetClose } from '@spartan-ng/brain/sheet';
import { HlmButton } from '@spartan-ng/helm/button';
import type { ClassValue } from 'clsx';

@Directive({
  selector: '[rbthDrawerClose]',
  host: {
    '[class]': '_computedClass()',
  },
  hostDirectives: [
    BrnSheetClose,
    { directive: HlmButton, inputs: ['variant', 'size'] },
  ],
})
export class RbthDrawerCloseDirective {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });
  protected _computedClass = computed(() =>
    hlm('size-6! px-0!', this.userClass()),
  );
}
