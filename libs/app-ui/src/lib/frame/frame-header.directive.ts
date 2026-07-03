import { computed, Directive, input } from '@angular/core';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ClassValue } from 'clsx';

import { hlm } from '@spartan-ng/helm/utils';

export const frameHeaderVariants = cva('flex flex-col', {
  variants: {
    size: {
      default: 'px-5 py-4',
      sm: 'px-3 py-2',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});
export type FrameHeaderVariants = VariantProps<typeof frameHeaderVariants>;

@Directive({
  selector: '[rbthFrameHeader]',
  host: {
    '[class]': '_computedClass()',
    'data-slot': 'frame-header',
  },
})
export class RbthFrameHeaderDirective {
  /** Compact paddings for dense layouts (overview cards, settings frames). */
  public readonly size = input<FrameHeaderVariants['size']>('default');

  public readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly _computedClass = computed(() =>
    hlm(frameHeaderVariants({ size: this.size() }), this.userClass())
  );
}
