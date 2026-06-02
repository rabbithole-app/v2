import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBoxes,
  lucideShare2,
} from '@ng-icons/lucide';

import { RbthSidebarMenuButton } from '@rabbithole/ui/sidebar';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSidebarImports, HlmSidebarService } from '@spartan-ng/helm/sidebar';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

@Component({
  selector: 'app-storage-switcher',
  templateUrl: './storage-switcher.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgIcon,
    RouterLink,
    RouterLinkActive,
    HlmIcon,
    RbthSidebarMenuButton,
    ...HlmSidebarImports,
    ...HlmTooltipImports,
  ],
  providers: [
    provideIcons({
      lucideBoxes,
      lucideShare2,
    }),
  ],
})
export class StorageSwitcherComponent {
  readonly menuItemClass =
    'group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center';
  readonly #sidebarService = inject(HlmSidebarService);
  readonly tooltipDisabled = computed(
    () =>
      this.#sidebarService.state() !== 'collapsed' ||
      this.#sidebarService.isMobile(),
  );
}
