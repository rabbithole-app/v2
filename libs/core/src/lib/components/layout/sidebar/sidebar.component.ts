import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  NavigationEnd,
  PRIMARY_OUTLET,
  Router,
  RouterLink,
  RouterOutlet,
} from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBookOpen, lucideGithub, lucideHouse } from '@ng-icons/lucide';
import { filter, map, startWith } from 'rxjs';

import { RbthSidebarMenuButton } from '@rabbithole/ui/sidebar';
import { HlmIcon } from '@spartan-ng/helm/icon';
import {
  HlmSidebarImports,
  HlmSidebarService,
  HlmSidebarWrapper,
} from '@spartan-ng/helm/sidebar';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { HlmLarge } from '@spartan-ng/helm/typography';

import { AccountMenuComponent } from '../../account/account-menu/account-menu.component';
import { NotificationBellComponent } from '../../ui/notification-bell/notification-bell.component';
import { SidebarHeaderComponent } from '../sidebar-header/sidebar-header.component';
import { ExpiredBannerComponent } from './expired-banner.component';
import { PageHeaderRouteData, PageHeaderService } from './page-header.service';
import { SidebarHeaderSlotDirective } from './sidebar-header-slot.directive';

@Component({
  selector: 'core-sidebar-layout',
  imports: [
    ...HlmSidebarImports,
    ...HlmTooltipImports,
    NgTemplateOutlet,
    SidebarHeaderComponent,
    RouterLink,
    RouterOutlet,
    AccountMenuComponent,
    NgIcon,
    HlmIcon,
    HlmLarge,
    RbthSidebarMenuButton,
    ExpiredBannerComponent,
    NotificationBellComponent,
  ],
  providers: [provideIcons({ lucideBookOpen, lucideGithub, lucideHouse })],
  templateUrl: './sidebar.component.html',
  hostDirectives: [HlmSidebarWrapper],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarLayoutComponent {
  readonly #pageHeader = inject(PageHeaderService);
  readonly headerActionsTemplate = this.#pageHeader.actionsTemplate;
  readonly headerContextTemplate = this.#pageHeader.contextTemplate;
  readonly #activatedRoute = inject(ActivatedRoute);
  readonly #router = inject(Router);
  readonly routeHeader = toSignal(
    this.#router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      startWith(null),
      map(() => readLeafHeaderData(this.#activatedRoute)),
    ),
    { initialValue: readLeafHeaderData(this.#activatedRoute) },
  );

  readonly pageSubtitle = computed(
    () =>
      this.#pageHeader.subtitleOverride() ?? this.routeHeader()?.subtitle ?? null,
  );
  readonly pageTitle = computed(
    () => this.#pageHeader.titleOverride() ?? this.routeHeader()?.title ?? null,
  );
  readonly sidebarHeaderSlot = contentChild(SidebarHeaderSlotDirective);
  #sidebarService = inject(HlmSidebarService);

  tooltipDisabled = computed(
    () =>
      this.#sidebarService.state() !== 'collapsed' ||
      this.#sidebarService.isMobile(),
  );
}

function readLeafHeaderData(route: ActivatedRoute): PageHeaderRouteData | null {
  let current: ActivatedRoute | null = route;
  let headerData: PageHeaderRouteData | null = null;

  while (current) {
    headerData = current.snapshot?.data?.['header'] ?? headerData;
    const primaryChild: ActivatedRoute | undefined = current.children?.find(
      (child) => child.outlet === PRIMARY_OUTLET,
    );
    if (!primaryChild) break;
    current = primaryChild;
  }

  return current?.snapshot?.data?.['header'] ?? headerData;
}
