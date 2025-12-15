import { Component } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucideDatabase, lucideHardDrive, lucideUsers } from '@ng-icons/lucide';

import { NavigationComponent, NavItem } from '@rabbithole/core';
import {
  RbthSidebarGroupContentDirective,
  RbthSidebarGroupDirective,
  RbthSidebarGroupLabelDirective,
} from '@rabbithole/ui';

@Component({
  selector: 'app-main-navigation',
  template: `
    <div rbthSidebarGroupLabel>Canisters</div>
    <div rbthSidebarGroupContent>
      <core-navigation [data]="data" />
    </div>
  `,
  standalone: true,
  imports: [
    NavigationComponent,
    RbthSidebarGroupLabelDirective,
    RbthSidebarGroupContentDirective,
  ],
  providers: [
    provideIcons({
      lucideDatabase,
      lucideHardDrive,
      lucideUsers,
    }),
  ],
  hostDirectives: [RbthSidebarGroupDirective],
})
export class MainNavigationComponent {
  data: NavItem[] = [
    {
      title: 'Storages',
      url: '/',
      icon: 'lucideHardDrive',
    },
    {
      title: 'Canisters',
      url: '/canisters',
      icon: 'lucideDatabase',
    },
    {
      title: 'Users',
      url: '/users',
      icon: 'lucideUsers',
    },
  ];
}
