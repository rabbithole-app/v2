import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  input,
} from '@angular/core';
import type { ClassValue } from 'clsx';

import { hlm } from '@spartan-ng/helm/utils';

@Component({
  selector: 'rbth-bento-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'computedClass()',
  },
  template: `<ng-content />`,
})
export class RbthBentoGrid {
  readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly computedClass = () =>
    hlm('grid w-full auto-rows-[22rem] grid-cols-3 gap-4', this.userClass());
}

@Component({
  selector: 'rbth-bento-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'computedClass()',
  },
  template: `
    <!-- Background slot -->
    <div>
      <ng-content select="[rbthBentoBackground]" />
    </div>

    <!-- Content -->
    <div class="p-4">
      <div
        class="pointer-events-none z-10 flex transform-gpu flex-col gap-1 transition-all duration-300 lg:group-hover:-translate-y-10"
      >
        <ng-content select="[rbthBentoIcon]" />
        <h3 class="text-xl font-semibold text-neutral-700 dark:text-neutral-300">
          {{ name() }}
        </h3>
        <p class="max-w-lg text-neutral-400">{{ description() }}</p>
      </div>

      <!-- CTA mobile (always visible) -->
      <div
        class="pointer-events-none flex w-full translate-y-0 transform-gpu flex-row items-center transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 lg:hidden"
      >
        <ng-content select="[rbthBentoCta]" />
      </div>
    </div>

    <!-- CTA desktop (appears on hover) -->
    <div
      class="pointer-events-none absolute bottom-0 hidden w-full translate-y-10 transform-gpu flex-row items-center p-4 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 lg:flex"
    >
      <ng-content select="[rbthBentoCtaDesktop]" />
    </div>

    <!-- Hover overlay -->
    <div
      class="pointer-events-none absolute inset-0 transform-gpu transition-all duration-300 group-hover:bg-black/[0.03] group-hover:dark:bg-neutral-800/10"
    ></div>
  `,
})
export class RbthBentoCard {
  readonly description = input.required<string>();
  readonly name = input.required<string>();
  readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly computedClass = () =>
    hlm(
      'group relative col-span-3 flex flex-col justify-between overflow-hidden rounded-xl',
      'bg-background [box-shadow:0_0_0_1px_rgba(0,0,0,.03),0_2px_4px_rgba(0,0,0,.05),0_12px_24px_rgba(0,0,0,.05)]',
      'dark:bg-background transform-gpu dark:[box-shadow:0_-20px_80px_-20px_#ffffff1f_inset] dark:[border:1px_solid_rgba(255,255,255,.1)]',
      this.userClass(),
    );
}

@Directive({
  selector: '[rbthBentoBackground]',
})
export class RbthBentoBackground {}

@Directive({
  selector: '[rbthBentoIcon]',
})
export class RbthBentoIcon {}

@Directive({
  selector: '[rbthBentoCta]',
})
export class RbthBentoCta {}

@Directive({
  selector: '[rbthBentoCtaDesktop]',
})
export class RbthBentoCtaDesktop {}

export const RbthBentoGridImports = [
  RbthBentoGrid,
  RbthBentoCard,
  RbthBentoBackground,
  RbthBentoIcon,
  RbthBentoCta,
  RbthBentoCtaDesktop,
] as const;
