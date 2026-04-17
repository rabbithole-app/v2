import { computed, Directive, input } from '@angular/core';
import type { ClassValue } from 'clsx';

import { hlm } from '@spartan-ng/helm/utils';

@Directive({
  selector: '[rbthFramePanel]',
  host: {
    '[class]': '_computedClass()',
    'data-slot': 'frame-panel',
  },
})
export class RbthFramePanelDirective {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly _computedClass = computed(() =>
    hlm(
      'relative rounded-xl border bg-background bg-clip-padding p-5 shadow-xs/5',
      'before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-xl,0.75rem)-1px)]',
      'before:shadow-[0_1px_theme(colors.black/4%)] dark:before:shadow-[0_-1px_theme(colors.white/6%)]',
      this.userClass()
    )
  );
}
