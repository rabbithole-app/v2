import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgIcon } from '@ng-icons/core';

import { RbthSidebarMenuButton } from '@rabbithole/ui';
import { HlmIcon } from '@spartan-ng/helm/icon';
import {
  HlmSidebarMenu,
  HlmSidebarMenuItem,
  HlmSidebarService
} from '@spartan-ng/helm/sidebar';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

export type NavItem = {
  icon: string;
  title: string;
  url: string;
};

@Component({
  selector: 'core-navigation',
  imports: [
    RouterLink,
    RouterLinkActive,
    NgIcon,
    HlmSidebarMenu,
    HlmSidebarMenuItem,
    RbthSidebarMenuButton,
    HlmIcon,
    ...HlmTooltipImports,
  ],
  templateUrl: './navigation.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavigationComponent {
  data = input.required<NavItem[]>();
  exact = input('/');

  #sidebarService = inject(HlmSidebarService);
  tooltipDisabled = computed(
    () =>
      this.#sidebarService.state() !== 'collapsed' ||
      this.#sidebarService.isMobile(),
  );
}
