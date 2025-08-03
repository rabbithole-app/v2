import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
  ViewEncapsulation,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeft } from '@ng-icons/lucide';
import { hlm } from '@spartan-ng/brain/core';
import { HlmButton, provideBrnButtonConfig } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import type { ClassValue } from 'clsx';

import { HlmCarousel } from './hlm-carousel';

@Component({
  selector: 'button[hlm-carousel-previous], button[hlmCarouselPrevious]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[disabled]': 'isDisabled()',
    '(click)': '_carousel.scrollPrev()',
  },
  hostDirectives: [{ directive: HlmButton, inputs: ['variant', 'size'] }],
  providers: [
    provideIcons({ lucideArrowLeft }),
    provideBrnButtonConfig({ variant: 'outline', size: 'icon' }),
  ],
  imports: [NgIcon, HlmIcon],
  template: `
    <ng-icon hlm size="sm" name="lucideArrowLeft" />
    <span class="sr-only">Previous slide</span>
  `,
})
export class HlmCarouselPrevious {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly _carousel = inject(HlmCarousel);

  private readonly _button = inject(HlmButton);

  private readonly _computedClass = computed(() =>
    hlm(
      'absolute h-8 w-8 rounded-full',
      this._carousel.orientation() === 'horizontal'
        ? '-left-12 top-1/2 -translate-y-1/2'
        : '-top-12 left-1/2 -translate-x-1/2 rotate-90',
      this.userClass(),
    ),
  );
  constructor() {
    effect(() => {
      const computedClass = this._computedClass();

      untracked(() => this._button.setClass(computedClass));
    });
  }

  protected readonly isDisabled = () => !this._carousel.canScrollPrev();
}
