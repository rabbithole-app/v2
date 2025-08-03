import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { ClassValue } from 'clsx';

import { HlmCarousel } from './hlm-carousel';

@Component({
  selector: 'hlm-carousel-slide-display',
  template: `
    <span class="sr-only">{{ _labelContent() }}</span>
    <div aria-hidden="true" class="text-muted-foreground text-sm">
      {{ _currentSlide() }} / {{ _carousel.slideCount() }}
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': '_computedClass()',
  },
})
export class HlmCarouselSlideDisplay {
  public readonly label = input('Slide');

  public readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly _carousel = inject(HlmCarousel);
  protected _computedClass = computed(() => this.userClass());

  protected readonly _currentSlide = computed(
    () => this._carousel.currentSlide() + 1,
  );

  protected readonly _labelContent = computed(() => {
    const currentSlide = this._currentSlide();
    const slideCount = this._carousel.slideCount();
    return `${this.label()} ${currentSlide} of ${slideCount} is displayed`;
  });
}
