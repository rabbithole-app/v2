import { computed, Directive, input } from '@angular/core';
import { hlm } from '@spartan-ng/brain/core';
import { BrnSheetCloseDirective } from '@spartan-ng/brain/sheet';
import { HlmButtonDirective } from '@spartan-ng/ui-button-helm';
import type { ClassValue } from 'clsx';

@Directive({
  selector: '[rbthDrawerClose]',
  host: {
    '[class]': '_computedClass()',
  },
  hostDirectives: [
    BrnSheetCloseDirective,
    { directive: HlmButtonDirective, inputs: ['variant', 'size'] },
  ],
})
export class RbthDrawerCloseDirective {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });
  protected _computedClass = computed(() =>
    hlm('size-6! px-0!', this.userClass())
  );
}
