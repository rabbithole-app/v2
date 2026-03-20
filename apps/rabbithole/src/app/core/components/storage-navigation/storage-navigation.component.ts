import { Component, computed, inject, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import {
  lucideDatabase,
  lucideFolder,
  lucideHardDrive,
} from '@ng-icons/lucide';
import { map } from 'rxjs/operators';

import {
  NavigationComponent,
  NavItem,
} from '@rabbithole/core';
import {
  HlmSidebarGroup,
  HlmSidebarGroupContent,
  HlmSidebarGroupLabel,
} from '@spartan-ng/helm/sidebar';

@Component({
  selector: 'app-storage-navigation',
  template: `<div hlmSidebarGroupLabel>
      Navigation
    </div>
    <div hlmSidebarGroupContent>
      <core-navigation [data]="data()" [exact]="'/dashboard/' + canisterId()" />
    </div> `,
  imports: [
    NavigationComponent,
    HlmSidebarGroupLabel,
    HlmSidebarGroupContent,
  ],
  providers: [
    provideIcons({
      lucideDatabase,
      lucideHardDrive,
      lucideFolder,
    }),
  ],
  hostDirectives: [HlmSidebarGroup],
})
export class StorageNavigationComponent {
  #route = inject(ActivatedRoute);
  canisterId = toSignal(
    this.#route.paramMap.pipe(map((params) => params.get('id'))),
  );
  data: Signal<NavItem[]> = computed(() => {
    const canisterId = this.canisterId();
    return [
      {
        title: 'Storage',
        url: `/dashboard/${canisterId}`,
        icon: 'lucideHardDrive',
      },
      {
        title: 'My Files',
        url: `/dashboard/${canisterId}/drive`,
        icon: 'lucideFolder',
      },
      {
        title: 'Canister settings',
        url: `/dashboard/${canisterId}/canister`,
        icon: 'lucideDatabase',
      },
    ];
  });
}
