import { Component, computed, inject, input } from '@angular/core';
import { hlm } from '@spartan-ng/brain/core';
import { ClassValue } from 'clsx';

import { SidebarService } from './sidebar.service';

@Component({
  selector: 'rbth-sidebar-rail',
  styles: `
    @reference 'tailwindcss';
    :host { @apply contents; }
  `,
  template: `<button
    data-sidebar="rail"
    aria-label="Toggle Sidebar"
    tabIndex="-1"
    title="Toggle Sidebar"
    [class]="buttonClass()"
    (click)="sidebarService.toggle()"
  >
    <span class="sr-only">Toggle Sidebar</span>
  </button>`,
})
export class RbthSidebarRailComponent {
  // eslint-disable-next-line @angular-eslint/no-input-rename
  readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly buttonClass = computed(() =>
    hlm(
      'hover:after:bg-sidebar-border absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] sm:flex',
      'in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize',
      '[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize',
      'hover:group-data-[collapsible=offcanvas]:bg-sidebar group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full',
      '[[data-side=left][data-collapsible=offcanvas]_&]:-right-2',
      '[[data-side=right][data-collapsible=offcanvas]_&]:-left-2',
      this.userClass()
    )
  );

  protected readonly sidebarService = inject(SidebarService);
}
