import { Component, computed, inject } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import {
  lucideClipboardList,
  lucideFolder,
  lucideHardDrive,
} from '@ng-icons/lucide';

import { NavigationComponent, NavItem } from '@rabbithole/core/app-runtime';
import {
  AccessRequestsCapabilityService,
  provideEncryptedStorage,
} from '@rabbithole/core/storage-runtime';
import {
  HlmSidebarGroup,
  HlmSidebarGroupContent,
  HlmSidebarGroupLabel,
} from '@spartan-ng/helm/sidebar';

@Component({
  selector: 'app-storage-navigation',
  template: `<div hlmSidebarGroupLabel>Storage</div>
    <div hlmSidebarGroupContent>
      <core-navigation [data]="data()" />
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
      lucideClipboardList,
    }),
    provideEncryptedStorage(),
    AccessRequestsCapabilityService,
  ],
  hostDirectives: [HlmSidebarGroup],
})
export class StorageNavigationComponent {
  readonly #accessRequestsCapability = inject(AccessRequestsCapabilityService);
  readonly data = computed<NavItem[]>(() => [
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
    ...(this.#accessRequestsCapability.canManage()
      ? [
          {
            title: 'Access requests',
            url: `/access-requests`,
            icon: 'lucideClipboardList',
            badgeCount: this.#accessRequestsCapability.pendingCount(),
          },
        ]
      : []),
  ]);
}
