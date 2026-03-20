import { Directive, input } from '@angular/core';
import { BrnButton } from '@spartan-ng/brain/button';
import { cva, type VariantProps } from 'class-variance-authority';

import { classes } from '@spartan-ng/helm/utils';

export const rainbowButtonVariants = cva(
  [
    'relative cursor-pointer group animate-rainbow',
    'inline-flex items-center justify-center gap-2 shrink-0',
    'rounded-md outline-none focus-visible:ring-[3px]',
    'text-sm font-medium whitespace-nowrap transition-all',
    'disabled:pointer-events-none disabled:opacity-50',
    "[&_ng-icon]:pointer-events-none [&_ng-icon]:shrink-0 [&_ng-icon:not([class*='text-'])]:text-base",
  ].join(' '),
  {
    variants: {
      variant: {
        default: [
          'border-0 bg-[length:200%] text-primary-foreground',
          '[background-clip:padding-box,border-box,border-box]',
          '[background-origin:border-box]',
          '[border:calc(0.125rem)_solid_transparent]',
          // Light mode
          'bg-[linear-gradient(#121213,#121213),linear-gradient(#121213_50%,rgba(18,18,19,0.6)_80%,rgba(18,18,19,0)),linear-gradient(90deg,var(--color-1),var(--color-5),var(--color-3),var(--color-4),var(--color-2))]',
          // Dark mode
          'dark:bg-[linear-gradient(#fff,#fff),linear-gradient(#fff_50%,rgba(255,255,255,0.6)_80%,rgba(0,0,0,0)),linear-gradient(90deg,var(--color-1),var(--color-5),var(--color-3),var(--color-4),var(--color-2))]',
          // Glow effect
          'before:absolute before:bottom-[-20%] before:left-1/2 before:z-0',
          'before:h-1/5 before:w-3/5 before:-translate-x-1/2',
          'before:animate-rainbow before:[filter:blur(0.75rem)]',
          'before:bg-[linear-gradient(90deg,var(--color-1),var(--color-5),var(--color-3),var(--color-4),var(--color-2))]',
        ].join(' '),
        outline: [
          'border border-input border-b-transparent bg-[length:200%] text-accent-foreground',
          '[background-clip:padding-box,border-box,border-box]',
          '[background-origin:border-box]',
          // Light mode
          'bg-[linear-gradient(#ffffff,#ffffff),linear-gradient(#ffffff_50%,rgba(18,18,19,0.6)_80%,rgba(18,18,19,0)),linear-gradient(90deg,var(--color-1),var(--color-5),var(--color-3),var(--color-4),var(--color-2))]',
          // Dark mode
          'dark:bg-[linear-gradient(#0a0a0a,#0a0a0a),linear-gradient(#0a0a0a_50%,rgba(255,255,255,0.6)_80%,rgba(0,0,0,0)),linear-gradient(90deg,var(--color-1),var(--color-5),var(--color-3),var(--color-4),var(--color-2))]',
          // Glow effect
          'before:absolute before:bottom-[-20%] before:left-1/2 before:z-0',
          'before:h-1/5 before:w-3/5 before:-translate-x-1/2',
          'before:animate-rainbow before:[filter:blur(0.75rem)]',
          'before:bg-[linear-gradient(90deg,var(--color-1),var(--color-5),var(--color-3),var(--color-4),var(--color-2))]',
        ].join(' '),
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-xl px-3 text-xs',
        lg: 'h-11 rounded-xl px-8',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export type RainbowButtonVariants = VariantProps<typeof rainbowButtonVariants>;

@Directive({
  selector: 'button[rbthRainbowBtn], a[rbthRainbowBtn]',
  exportAs: 'rbthRainbowBtn',
  hostDirectives: [{ directive: BrnButton, inputs: ['disabled'] }],
  host: {
    'data-slot': 'rainbow-button',
  },
})
export class RbthRainbowButton {
  public readonly size = input<RainbowButtonVariants['size']>('default');
  public readonly variant = input<RainbowButtonVariants['variant']>('default');

  constructor() {
    classes(() => [
      rainbowButtonVariants({ variant: this.variant(), size: this.size() }),
    ]);
  }
}
