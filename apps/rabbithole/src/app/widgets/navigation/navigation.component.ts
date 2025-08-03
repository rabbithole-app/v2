import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBookOpen,
  lucideBot,
  lucideSettings2,
  lucideSquareTerminal,
} from '@ng-icons/lucide';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { combineLatestWith, map } from 'rxjs/operators';

import {
  RbthSidebarMenuButtonDirective,
  RbthSidebarMenuDirective,
  RbthSidebarMenuItemDirective,
  RbthTooltipTriggerDirective,
  SidebarService,
} from '@rabbithole/ui';
import { MOBILE_BREAKPOINT } from '@rabbithole/ui';

type NavItem = {
  icon: string;
  title: string;
  url: string;
};

const NAVIGATION_ITEMS: NavItem[] = [
  {
    title: 'Playground',
    url: '/',
    icon: 'lucideSquareTerminal',
  },
  {
    title: 'Models',
    url: '#',
    icon: 'lucideBot',
  },
  {
    title: 'Documentation',
    url: '#',
    icon: 'lucideBookOpen',
  },
  {
    title: 'Settings',
    url: '#',
    icon: 'lucideSettings2',
  },
];

@Component({
  selector: 'app-navigation',
  imports: [
    RouterLink,
    RouterLinkActive,
    NgIcon,
    RbthSidebarMenuDirective,
    RbthSidebarMenuItemDirective,
    RbthSidebarMenuButtonDirective,
    HlmIcon,
    RbthTooltipTriggerDirective,
  ],
  templateUrl: './navigation.component.html',
  styles: ``,
  providers: [
    provideIcons({
      lucideBookOpen,
      lucideBot,
      lucideSettings2,
      lucideSquareTerminal,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavigationComponent {
  breakpointObserver = inject(BreakpointObserver);
  readonly data = NAVIGATION_ITEMS;
  #sidebarService = inject(SidebarService);
  tooltipDisabled = toSignal(
    this.breakpointObserver.observe(`(min-width: ${MOBILE_BREAKPOINT}px)`).pipe(
      combineLatestWith(
        toObservable(this.#sidebarService.state).pipe(
          map((state) => state.isOpen),
        ),
      ),
      map(([state, isOpen]) => !state.matches || isOpen),
    ),
  );
}
