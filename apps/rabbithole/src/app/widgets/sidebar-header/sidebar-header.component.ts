import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronsUpDown } from '@ng-icons/lucide';
import { BrnMenuTriggerDirective } from '@spartan-ng/brain/menu';
import { HlmButtonDirective } from '@spartan-ng/ui-button-helm';
import { HlmIconDirective } from '@spartan-ng/ui-icon-helm';
// import {
//   HlmMenuComponent,
//   HlmMenuGroupComponent,
//   HlmMenuItemDirective,
//   HlmMenuItemIconDirective,
//   HlmMenuItemSubIndicatorComponent,
//   HlmMenuLabelComponent,
//   HlmMenuSeparatorComponent,
//   HlmMenuShortcutComponent,
//   HlmSubMenuComponent,
// } from '@spartan-ng/ui-menu-helm';

import {
  RbthSidebarHeaderDirective,
  RbthSidebarMenuButtonDirective,
  RbthSidebarMenuDirective,
  RbthSidebarMenuItemDirective,
} from '@rabbithole/ui';

@Component({
  selector: 'app-sidebar-header',
  imports: [
    BrnMenuTriggerDirective,

    // HlmMenuComponent,
    // HlmSubMenuComponent,
    // HlmMenuItemDirective,
    // HlmMenuItemSubIndicatorComponent,
    // HlmMenuLabelComponent,
    // HlmMenuShortcutComponent,
    // HlmMenuSeparatorComponent,
    // HlmMenuItemIconDirective,
    // HlmMenuGroupComponent,

    HlmButtonDirective,
    HlmIconDirective,
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
