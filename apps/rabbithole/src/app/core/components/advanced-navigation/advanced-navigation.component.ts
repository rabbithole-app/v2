import {
  ChangeDetectionStrategy,
  Component,
  signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronDown,
  lucideEllipsis,
  lucideTags,
  lucideUsers,
} from '@ng-icons/lucide';

import { HlmCollapsibleImports } from '@spartan-ng/helm/collapsible';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSidebarImports } from '@spartan-ng/helm/sidebar';

@Component({
  selector: 'app-advanced-navigation',
  templateUrl: './advanced-navigation.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RouterLinkActive,
    NgIcon,
    HlmIcon,
    ...HlmSidebarImports,
    ...HlmCollapsibleImports,
    ...HlmDropdownMenuImports,
  ],
  providers: [
    provideIcons({
      lucideChevronDown,
      lucideEllipsis,
      lucideTags,
      lucideUsers,
    }),
  ],
})
export class AdvancedNavigationComponent {
  readonly advancedExpanded = signal(false);

  readonly advancedNavItems = [
    { icon: 'lucideTags', label: 'Releases', route: '/dashboard/releases' },
    { icon: 'lucideUsers', label: 'Users', route: '/dashboard/users' },
  ];

  readonly menuItemClass =
    'group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center';
}
