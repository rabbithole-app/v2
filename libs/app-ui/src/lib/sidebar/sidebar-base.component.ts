import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { hlm } from '@spartan-ng/brain/core';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ClassValue } from 'clsx';

import { SidebarService } from './sidebar.service';
import { injectSidebarConfig, SidebarConfig } from './sidebar.token';

export const sidebarVariants = cva('text-sidebar-foreground', {
  variants: {
    collapsible: {
      offcanvas: '',
      icon: '',
      none: '',
    },
  },
  compoundVariants: [
    {
      collapsible: 'none',
      class: 'bg-sidebar flex h-full w-(--sidebar-width) flex-col',
    },
    {
      collapsible: ['icon', 'offcanvas'],
      class: 'group peer block',
    },
  ],
  defaultVariants: {
    collapsible: 'offcanvas',
  },
});

export type SidebarVariants = VariantProps<typeof sidebarVariants>;

@Component({
  selector: 'rbth-sidebar-base',
  imports: [NgTemplateOutlet],
  templateUrl: './sidebar-base.component.html',
  host: {
    '[class]': 'computedClass()',
    '[attr.data-variant]': 'variant()',
    '[attr.data-side]': 'side()',
    '[attr.data-state]': 'state()',
    '[attr.data-collapsible]': 'attrDataCollapsible()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RbthSidebarBaseComponent {
  private readonly _config = injectSidebarConfig();
  collapsible = input<NonNullable<SidebarVariants['collapsible']>>(
    this._config.collapsible
  );
  #sidebarService = inject(SidebarService);

  state = computed(() =>
    this.#sidebarService.state().isOpen ? 'expanded' : 'collapsed'
  );
  attrDataCollapsible = computed(() =>
    this.state() === 'collapsed' ? this.collapsible() : ''
  );
  side = input<SidebarConfig['side']>(this._config.side);
  // eslint-disable-next-line @angular-eslint/no-input-rename
  readonly userClass = input<ClassValue>('', { alias: 'class' });
  variant = input<SidebarConfig['variant']>(this._config.variant);

  private readonly additionalClasses = signal<ClassValue>('');

  protected readonly computedClass = computed(() =>
    hlm(
      sidebarVariants({ collapsible: this.collapsible() }),
      this.userClass(),
      this.additionalClasses()
    )
  );

  protected readonly sidebarContainerClass = computed(() => {
    const variant = this.variant();
    const side = this.side();
    return hlm(
      'fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear md:flex',
      side === 'left'
        ? 'left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]'
        : 'right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]',
      // Adjust the padding for floating and inset variants.
      variant === 'floating' || variant === 'inset'
        ? 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]'
        : 'group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l',
      this.userClass()
    );
  });

  protected readonly sidebarGapClass = computed(() => {
    const variant = this.variant();
    return hlm(
      'relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear',
      'group-data-[collapsible=offcanvas]:w-0',
      'group-data-[side=right]:rotate-180',
      variant === 'floating' || variant === 'inset'
        ? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]'
        : 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)'
    );
  });

  protected readonly sidebarInnerClass = computed(() =>
    hlm(
      'bg-sidebar group-data-[variant=floating]:border-sidebar-border flex h-full w-full flex-col group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:shadow-sm'
    )
  );
}
