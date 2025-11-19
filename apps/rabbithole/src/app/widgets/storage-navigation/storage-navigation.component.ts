import { Component, computed, inject, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import {
  lucideDatabase,
  lucideFolder,
  lucideHardDrive,
  lucideUserCog,
} from '@ng-icons/lucide';
import { map } from 'rxjs/operators';

import {
  NavigationComponent,
  NavItem,
} from '../navigation/navigation.component';
import {
  RbthSidebarGroupContentDirective,
  RbthSidebarGroupDirective,
  RbthSidebarGroupLabelDirective,
} from '@rabbithole/ui';

@Component({
  selector: 'app-storage-navigation',
  template: `<div rbthSidebarGroupLabel>Storage {{ canisterId() }}</div>
    <div rbthSidebarGroupContent>
      <app-navigation [data]="data()" [exact]="'/' + canisterId()" />
    </div> `,
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
      lucideUserCog,
      lucideFolder,
    }),
  ],
  hostDirectives: [RbthSidebarGroupDirective],
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
        url: `/${canisterId}`,
        icon: 'lucideHardDrive',
      },
      {
        title: 'My Files',
        url: `/${canisterId}/drive`,
        icon: 'lucideFolder',
      },
      {
        title: 'Permissions',
        url: `/${canisterId}/permissions`,
        icon: 'lucideUserCog',
      },
      {
        title: 'Canister settings',
        url: `/canisters/${canisterId}`,
        icon: 'lucideDatabase',
      },
    ];
  });
}
