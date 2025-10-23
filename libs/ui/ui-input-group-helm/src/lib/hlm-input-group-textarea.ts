import { computed, Directive, effect, inject, input } from '@angular/core';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { hlm } from '@spartan-ng/helm/utils';
import type { ClassValue } from 'clsx';

@Directive({
  selector: 'textarea[hlmInputGroupTextarea]',
  hostDirectives: [HlmTextarea],
  host: {
    '[class]': '_computedClass()',
    'data-slot': 'input-group-control',
  },
})
export class HlmInputGroupTextarea {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly _computedClass = computed(() =>
    hlm(
      'flex-1 resize-none rounded-none border-0 bg-transparent py-3 shadow-none focus-visible:ring-0 dark:bg-transparent',
      this.userClass(),
    ),
  );

  private readonly _hlmInput = inject(HlmTextarea);

  constructor() {
    effect(() => {
      this._hlmInput.setClass(this._computedClass());
    });
  }
}
