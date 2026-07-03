import { computed, Directive, input } from '@angular/core';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ClassValue } from 'clsx';

import { hlm } from '@spartan-ng/helm/utils';

export const framePanelVariants = cva(
  [
    'relative border bg-background bg-clip-padding shadow-xs/5',
    'before:pointer-events-none before:absolute before:inset-0',
    'before:shadow-[0_1px_theme(colors.black/4%)] dark:before:shadow-[0_-1px_theme(colors.white/6%)]',
  ],
  {
    variants: {
      size: {
        default:
          'rounded-xl p-5 before:rounded-[calc(var(--radius-xl,0.75rem)-1px)]',
        sm: 'rounded-lg p-3 before:rounded-[calc(var(--radius-lg,0.5rem)-1px)]',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
);
export type FramePanelVariants = VariantProps<typeof framePanelVariants>;

@Directive({
  selector: '[rbthFramePanel]',
  host: {
    '[class]': '_computedClass()',
    'data-slot': 'frame-panel',
  },
})
export class RbthFramePanelDirective {
  /** Compact paddings for dense layouts (overview cards, settings frames). */
  public readonly size = input<FramePanelVariants['size']>('default');

  public readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly _computedClass = computed(() =>
    hlm(framePanelVariants({ size: this.size() }), this.userClass())
  );
}
