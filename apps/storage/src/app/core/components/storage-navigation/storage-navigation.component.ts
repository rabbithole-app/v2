import { Component } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import {
  lucideFolder,
  lucideHardDrive,
} from '@ng-icons/lucide';

import { NavigationComponent, NavItem } from '@rabbithole/core';
import {
  HlmSidebarGroup,
  HlmSidebarGroupContent,
  HlmSidebarGroupLabel,
} from '@spartan-ng/helm/sidebar';

@Component({
  selector: 'app-storage-navigation',
  template: `<div hlmSidebarGroupLabel>Storage</div>
    <div hlmSidebarGroupContent>
      <core-navigation [data]="data" />
    </div> `,
  imports: [
    NavigationComponent,
    HlmSidebarGroupLabel,
    HlmSidebarGroupContent,
  ],
  providers: [
    provideIcons({
      lucideHardDrive,
      lucideFolder,
    }),
  ],
  hostDirectives: [HlmSidebarGroup],
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
  ];
}
