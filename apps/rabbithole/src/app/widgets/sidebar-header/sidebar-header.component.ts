import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronsUpDown } from '@ng-icons/lucide';
import { BrnMenuTrigger } from '@spartan-ng/brain/menu';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
// import {
//   HlmMenu,
//   HlmMenuGroup,
//   HlmMenuItem,
//   HlmMenuItemIcon,
//   HlmMenuItemSubIndicator,
//   HlmMenuLabel,
//   HlmMenuSeparator,
//   HlmMenuShortcut,
//   HlmSubMenu,
// } from '@spartan-ng/helm/menu';

import {
  RbthSidebarHeaderDirective,
  RbthSidebarMenuButtonDirective,
  RbthSidebarMenuDirective,
  RbthSidebarMenuItemDirective,
} from '@rabbithole/ui';

@Component({
  selector: 'app-sidebar-header',
  imports: [
    BrnMenuTrigger,

    // HlmMenuComponent,
    // HlmSubMenuComponent,
    // HlmMenuItemDirective,
    // HlmMenuItemSubIndicatorComponent,
    // HlmMenuLabelComponent,
    // HlmMenuShortcutComponent,
    // HlmMenuSeparatorComponent,
    // HlmMenuItemIconDirective,
    // HlmMenuGroupComponent,

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
