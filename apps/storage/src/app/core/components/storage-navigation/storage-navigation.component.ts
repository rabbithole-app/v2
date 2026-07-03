import { Component, computed, inject, resource } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import {
  lucideClipboardList,
  lucideCloud,
  lucideFolder,
  lucideHardDrive,
} from '@ng-icons/lucide';

import { NavigationComponent, NavItem } from '@rabbithole/core/app-runtime';
import {
  AccessRequestsCapabilityService,
  injectEncryptedStorage,
  provideEncryptedStorage,
} from '@rabbithole/core/storage-runtime';
import type { StorageBackend } from '@rabbithole/declarations/encrypted-storage';
import {
  HlmSidebarGroup,
  HlmSidebarGroupContent,
  HlmSidebarGroupLabel,
} from '@spartan-ng/helm/sidebar';

@Component({
  selector: 'app-storage-navigation',
  template: `<div hlmSidebarGroupLabel>Storage</div>
    <div hlmSidebarGroupContent>
      <rbth-core-navigation [data]="data()" />
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
      lucideCloud,
      lucideClipboardList,
    }),
    provideEncryptedStorage(),
    AccessRequestsCapabilityService,
  ],
  hostDirectives: [HlmSidebarGroup],
})
export class StorageNavigationComponent {
  readonly #accessRequestsCapability = inject(AccessRequestsCapabilityService);
  readonly #encryptedStorage = injectEncryptedStorage();
  readonly #storageBackend = resource({
    loader: async (): Promise<StorageBackend | null> =>
      this.#encryptedStorage().getStorageBackend(),
    defaultValue: null,
  });
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
    ...(isBlobStorageBackend(this.#storageBackend.value())
      ? [
          {
            title: 'Data storage',
            url: `/storage-settings`,
            icon: 'lucideCloud',
          },
        ]
      : []),
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

function isBlobStorageBackend(backend: StorageBackend | null): boolean {
  return backend !== null && 'BlobStorage' in backend;
}
