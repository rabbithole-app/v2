import { Component, computed, inject, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePanelLeft } from '@ng-icons/lucide';
import { hlm } from '@spartan-ng/brain/core';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { ClassValue } from 'clsx';

import { SidebarService } from './sidebar.service';

@Component({
  selector: 'rbth-sidebar-trigger',
  imports: [HlmButton, HlmIcon, NgIcon],
  providers: [provideIcons({ lucidePanelLeft })],
  template: `<button
    hlmBtn
    data-sidebar="trigger"
    variant="ghost"
    size="icon"
    [class]="buttonClass()"
    (click)="sidebarService.toggle()"
  >
    <ng-icon hlm size="sm" name="lucidePanelLeft" />
    <span class="sr-only">Toggle Sidebar</span>
  </button>`,
})
export class RbthSidebarTriggerComponent {
  readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly buttonClass = computed(() =>
    hlm('size-7', this.userClass()),
  );

  protected readonly sidebarService = inject(SidebarService);
}
