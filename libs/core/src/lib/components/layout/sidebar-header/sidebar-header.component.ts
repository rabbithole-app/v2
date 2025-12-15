import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronsUpDown } from '@ng-icons/lucide';

import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';

import {
  RbthSidebarHeaderDirective,
  RbthSidebarMenuButtonDirective,
  RbthSidebarMenuDirective,
  RbthSidebarMenuItemDirective,
} from '@rabbithole/ui';

@Component({
  selector: 'core-sidebar-header',
  standalone: true,
  imports: [
    HlmButton,
    HlmIcon,
    NgIcon,
    RbthSidebarMenuDirective,
    RbthSidebarMenuItemDirective,
    RbthSidebarMenuButtonDirective,
  ],
  templateUrl: './sidebar-header.component.html',
  styles: ``,
  providers: [
    provideIcons({
      lucideChevronsUpDown,
    }),
  ],
  hostDirectives: [RbthSidebarHeaderDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarHeaderComponent {}
