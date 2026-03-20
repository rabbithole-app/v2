import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import type { ClassValue } from 'clsx';

import { hlm } from '@spartan-ng/helm/utils';

@Component({
  selector: 'rbth-magic-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'computedClass()',
    '(pointerenter)': 'onEnter()',
    '(pointermove)': 'onMove($event)',
    '(pointerleave)': 'onLeave()',
  },
  template: `
    <!-- Solid background (hides the border gradient except at edges) -->
    <div class="bg-background absolute inset-px z-20 rounded-[inherit]"></div>

    <!-- Hover spotlight -->
    <div
      class="pointer-events-none absolute inset-px z-30 rounded-[inherit] transition-opacity duration-300"
      [style.opacity]="hovered() ? gradientOpacity() : 0"
      [style.background]="spotlightGradient()"
    ></div>

    <!-- Content -->
    <div class="relative z-40">
      <ng-content />
    </div>
  `,
})
export class RbthMagicCard {
  readonly gradientFrom = input('#9E7AFF');
  readonly gradientSize = input(200);
  readonly gradientTo = input('#FE8BBB');
  readonly #mouseX = signal(-200);
  readonly #mouseY = signal(-200);
  readonly borderGradient = computed(() => {
    const size = this.gradientSize();
    const x = this.#mouseX();
    const y = this.#mouseY();
    return `linear-gradient(var(--color-background) 0 0) padding-box, radial-gradient(${size}px circle at ${x}px ${y}px, ${this.gradientFrom()}, ${this.gradientTo()}, var(--color-border) 100%) border-box`;
  });

  readonly userClass = input<ClassValue>('', { alias: 'class' });
  readonly computedClass = computed(() =>
    hlm(
      'group relative isolate overflow-hidden rounded-xl border border-transparent',
      this.userClass(),
    ),
  );
  readonly gradientColor = input('rgba(150, 150, 150, 0.05)');

  readonly gradientOpacity = input(1);

  readonly hovered = signal(false);

  readonly spotlightGradient = computed(() => {
    const size = this.gradientSize();
    const x = this.#mouseX();
    const y = this.#mouseY();
    return `radial-gradient(${size}px circle at ${x}px ${y}px, ${this.gradientColor()}, transparent 100%)`;
  });

  readonly #el = inject(ElementRef);

  constructor() {
    // Reactively update border gradient when mouse position changes
    effect(() => {
      const bg = this.borderGradient();
      (this.#el.nativeElement as HTMLElement).style.background = bg;
    });
  }

  onEnter(): void {
    this.hovered.set(true);
  }

  onLeave(): void {
    this.hovered.set(false);
    const size = this.gradientSize();
    this.#mouseX.set(-size);
    this.#mouseY.set(-size);
  }

  onMove(e: PointerEvent): void {
    const rect = (this.#el.nativeElement as HTMLElement).getBoundingClientRect();
    this.#mouseX.set(e.clientX - rect.left);
    this.#mouseY.set(e.clientY - rect.top);
  }
}
