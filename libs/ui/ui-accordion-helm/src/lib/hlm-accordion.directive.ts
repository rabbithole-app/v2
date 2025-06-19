import { computed, Directive, inject, input } from '@angular/core';
import { BrnAccordionDirective } from '@spartan-ng/brain/accordion';
import { hlm } from '@spartan-ng/brain/core';
import type { ClassValue } from 'clsx';

@Directive({
  selector: '[hlmAccordion], hlm-accordion',
  host: {
    '[class]': '_computedClass()',
  },
  hostDirectives: [
    {
      directive: BrnAccordionDirective,
      inputs: ['type', 'dir', 'orientation'],
    },
  ],
})
export class HlmAccordionDirective {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });

  private readonly _brn = inject(BrnAccordionDirective);
  protected readonly _computedClass = computed(() =>
    hlm(
      'flex',
      this._brn.orientation() === 'horizontal' ? 'flex-row' : 'flex-col',
      this.userClass()
    )
  );
}
