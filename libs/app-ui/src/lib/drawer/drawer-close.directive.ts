import { computed, Directive, input } from '@angular/core';
import { BrnSheetClose } from '@spartan-ng/brain/sheet';
import type { ClassValue } from 'clsx';

import { HlmButton } from '@spartan-ng/helm/button';
import { hlm } from '@spartan-ng/helm/utils';

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
