import { BreakpointObserver } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
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
    RbthSidebarMenuDirective,
    RbthSidebarMenuItemDirective,
    RbthSidebarMenuButtonDirective,
    HlmIcon,
    RbthTooltipTriggerDirective,
  ],
  templateUrl: './navigation.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavigationComponent {
  breakpointObserver = inject(BreakpointObserver);
  data = input.required<NavItem[]>();
  exact = input('/');
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
