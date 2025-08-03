import { coerceNumberProperty, type NumberInput } from '@angular/cdk/coercion';
import {
  type AfterViewInit,
  computed,
  Directive,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import { hlm } from '@spartan-ng/brain/core';
import type { ClassValue } from 'clsx';

const parseDividedString = (value: NumberInput): NumberInput => {
  if (typeof value !== 'string' || !value.includes('/')) return value;
  return value
    .split('/')
    .map((v) => Number.parseInt(v, 10))
    .reduce((a, b) => a / b);
};

@Directive({
  selector: '[hlmAspectRatio]',
  host: {
    '[class]': '_computedClass()',
    '[style.padding-bottom]': '_computedPaddingBottom()',
  },
})
export class HlmAspectRatio implements AfterViewInit {
  public readonly ratio = input(1, {
    alias: 'hlmAspectRatio',
    transform: (value: NumberInput) => {
      const coerced = coerceNumberProperty(parseDividedString(value));
      return coerced <= 0 ? 1 : coerced;
    },
  });

  public readonly userClass = input<ClassValue>('', { alias: 'class' });
  protected readonly _computedClass = computed(() =>
    hlm('relative w-full', this.userClass()),
  );

  protected readonly _computedPaddingBottom = computed(
    () => `${100 / this.ratio()}%`,
  );
  private readonly _el =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  ngAfterViewInit() {
    // support delayed addition of image to dom
    const child = this._el.firstElementChild;
    if (child) {
      child.classList.add('absolute', 'w-full', 'h-full', 'object-cover');
    }
  }
}
