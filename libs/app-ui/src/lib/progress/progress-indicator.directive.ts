import { computed, Directive, input } from '@angular/core';
import { hlm } from '@spartan-ng/helm/utils';
import { injectBrnProgress } from '@spartan-ng/brain/progress';
import { cva } from 'class-variance-authority';
import type { ClassValue } from 'clsx';

export const indicatorVariants = cva(
  'flex bg-primary h-full w-full flex-1 transition-all',
  {
    variants: {
      indeterminate: {
        true: 'animate-indeterminate repeat-infinite',
      },
    },
    defaultVariants: {
      indeterminate: false,
    },
  }
);

@Directive({
  selector: '[rbthProgressIndicator],brn-progress-indicator[rbth]',
  host: {
    '[class]': '_computedClass()',
    '[style.transform]': 'transform()',
  },
})
export class RbthProgressIndicatorDirective {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });
  private readonly _progress = injectBrnProgress();

  protected readonly indeterminate = computed(
    () =>
      this._progress.value() === null || this._progress.value() === undefined
  );

  protected readonly _computedClass = computed(() =>
    hlm(
      indicatorVariants({ indeterminate: this.indeterminate() }),
      this.userClass()
    )
  );

  protected readonly transform = computed(
    () => `translateX(-${100 - (this._progress.value() ?? 100)}%)`
  );
}
