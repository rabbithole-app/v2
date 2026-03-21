import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBookOpen, lucideGithub } from '@ng-icons/lucide';

import { RbthSidebarMenuButton } from '@rabbithole/ui';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSeparator } from '@spartan-ng/helm/separator';
import {
  HlmSidebarImports,
  HlmSidebarService,
  HlmSidebarWrapper,
} from '@spartan-ng/helm/sidebar';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { AccountMenuComponent } from '../../account/account-menu/account-menu.component';
import { SidebarHeaderComponent } from '../sidebar-header/sidebar-header.component';

@Component({
  selector: 'core-sidebar-layout',
  imports: [
    ...HlmSidebarImports,
    ...HlmTooltipImports,
    SidebarHeaderComponent,
    RouterOutlet,
    HlmSeparator,
    AccountMenuComponent,
    NgIcon,
    HlmIcon,
    RbthSidebarMenuButton,
  ],
  providers: [provideIcons({ lucideBookOpen, lucideGithub })],
  templateUrl: './sidebar.component.html',
  hostDirectives: [HlmSidebarWrapper],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarLayoutComponent {
  #sidebarService = inject(HlmSidebarService);
  tooltipDisabled = computed(
    () =>
      this.#sidebarService.state() !== 'collapsed' ||
      this.#sidebarService.isMobile(),
  );
}
