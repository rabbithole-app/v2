import { computed, Directive, input } from '@angular/core';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ClassValue } from 'clsx';

import { hlm } from '@spartan-ng/helm/utils';

export const frameFooterVariants = cva('', {
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
export type FrameFooterVariants = VariantProps<typeof frameFooterVariants>;

@Directive({
  selector: '[rbthFrameFooter]',
  host: {
    '[class]': '_computedClass()',
    'data-slot': 'frame-footer',
  },
})
export class RbthFrameFooterDirective {
  /** Compact paddings for dense layouts (overview cards, settings frames). */
  public readonly size = input<FrameFooterVariants['size']>('default');

  public readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly _computedClass = computed(() =>
    hlm(frameFooterVariants({ size: this.size() }), this.userClass())
  );
}
