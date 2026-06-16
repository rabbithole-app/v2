import {
  Component,
  computed,
  inject,
  Injector,
  resource,
  runInInjectionContext,
  Signal,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute } from "@angular/router";
import { provideIcons } from "@ng-icons/core";
import {
  lucideClipboardList,
  lucideDatabase,
  lucideFolder,
  lucideHardDrive,
} from "@ng-icons/lucide";
import { map } from "rxjs/operators";

import { NavigationComponent, NavItem } from "@rabbithole/core";
import {
  type AccessRequestsCapability,
  AccessRequestsCapabilityService,
  provideEncryptedStorage,
  provideEncryptedStorageCanisterId,
} from "@rabbithole/core/storage-runtime";
import {
  HlmSidebarGroup,
  HlmSidebarGroupContent,
  HlmSidebarGroupLabel,
} from "@spartan-ng/helm/sidebar";

const EMPTY_ACCESS_REQUESTS_CAPABILITY: AccessRequestsCapability = {
  canManage: false,
  pendingCount: 0,
};

@Component({
  selector: "app-storage-navigation",
  template: `<div hlmSidebarGroupLabel>Current storage</div>
    <div hlmSidebarGroupContent>
      <rbth-core-navigation [data]="data()" [exact]="'/dashboard/' + canisterId()" />
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
      lucideClipboardList,
    }),
  ],
  hostDirectives: [HlmSidebarGroup],
})
export class StorageNavigationComponent {
  #route = inject(ActivatedRoute);
  canisterId = toSignal(
    this.#route.paramMap.pipe(map((params) => params.get("id"))),
    { initialValue: this.#route.snapshot.paramMap.get("id") },
  );
  readonly #injector = inject(Injector);
  // eslint-disable-next-line perfectionist/sort-classes -- parent injector must exist before the resource loader runs.
  readonly #requestAccessCapability = resource({
    params: () => this.canisterId(),
    loader: ({ params: canisterId }) =>
      this.#loadAccessRequestsCapability(canisterId),
    defaultValue: EMPTY_ACCESS_REQUESTS_CAPABILITY,
  });
  data: Signal<NavItem[]> = computed(() => {
    const canisterId = this.canisterId();
    if (!canisterId) return [];
    const accessRequestsCapability =
      this.#requestAccessCapability.value() ?? EMPTY_ACCESS_REQUESTS_CAPABILITY;
    return [
      {
        title: "Storage",
        url: `/dashboard/${canisterId}`,
        icon: "lucideHardDrive",
      },
      {
        title: "My Files",
        url: `/dashboard/${canisterId}/drive`,
        icon: "lucideFolder",
      },
      ...(accessRequestsCapability.canManage
        ? [
            {
              title: "Access requests",
              url: `/dashboard/${canisterId}/access-requests`,
              icon: "lucideClipboardList",
              badgeCount: accessRequestsCapability.pendingCount,
            },
          ]
        : []),
      {
        title: "Canister settings",
        url: `/dashboard/${canisterId}/canister`,
        icon: "lucideDatabase",
      },
    ];
  });

  async #loadAccessRequestsCapability(
    canisterId: string | null,
  ): Promise<AccessRequestsCapability> {
    if (!canisterId) {
      return EMPTY_ACCESS_REQUESTS_CAPABILITY;
    }

    try {
      return await runInInjectionContext(
        Injector.create({
          providers: [
            provideEncryptedStorageCanisterId(canisterId),
            provideEncryptedStorage(),
            AccessRequestsCapabilityService,
          ],
          parent: this.#injector,
        }),
        async () => {
          const capability = inject(AccessRequestsCapabilityService);
          return capability.load();
        },
      );
    } catch {
      return EMPTY_ACCESS_REQUESTS_CAPABILITY;
    }
  }
}
