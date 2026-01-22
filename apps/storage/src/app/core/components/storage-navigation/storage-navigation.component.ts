import { Component } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import {
  lucideFolder,
  lucideHardDrive,
  lucideUserCog,
} from '@ng-icons/lucide';

import { NavigationComponent, NavItem } from '@rabbithole/core';
import {
  RbthSidebarGroupContentDirective,
  RbthSidebarGroupDirective,
  RbthSidebarGroupLabelDirective,
} from '@rabbithole/ui';

@Component({
  selector: 'app-storage-navigation',
  template: `<div rbthSidebarGroupLabel>Storage</div>
    <div rbthSidebarGroupContent>
      <core-navigation [data]="data" />
    </div> `,
  standalone: true,
  imports: [
    NavigationComponent,
    RbthSidebarGroupLabelDirective,
    RbthSidebarGroupContentDirective,
  ],
  providers: [
    provideIcons({
      lucideHardDrive,
      lucideUserCog,
      lucideFolder,
    }),
  ],
  hostDirectives: [RbthSidebarGroupDirective],
})
export class StorageNavigationComponent {
  data: NavItem[] = [
    {
      title: 'Storage',
      url: `/`,
      icon: 'lucideHardDrive',
    },
    {
      title: 'My Files',
      url: `/drive`,
      icon: 'lucideFolder',
    },
    {
      title: 'Permissions',
      url: `/permissions`,
      icon: 'lucideUserCog',
    },
  ];
}
