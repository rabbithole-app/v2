import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ClassValue } from 'clsx';

import { hlm } from '@spartan-ng/helm/utils';

export const frameVariants = cva(
  [
    'relative flex flex-col bg-muted/72 p-1',
    '*:[[data-slot=frame-panel]+[data-slot=frame-panel]]:mt-1',
  ],
  {
    variants: {
      size: {
        default: 'rounded-2xl',
        sm: 'rounded-xl',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
);
export type FrameVariants = VariantProps<typeof frameVariants>;

@Component({
  selector: 'rbth-frame',
  template: `<ng-content />`,
  host: {
    '[class]': '_computedClass()',
    'data-slot': 'frame',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RbthFrameComponent {
  /** Compact radius for dense layouts (overview cards, settings frames). */
  public readonly size = input<FrameVariants['size']>('default');

  public readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly _computedClass = computed(() =>
    hlm(frameVariants({ size: this.size() }), this.userClass())
  );
}
