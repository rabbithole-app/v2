import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { HlmSidebarImports } from '@spartan-ng/helm/sidebar';

import { AccessRequestSidebarItemComponent } from './access-request-sidebar-item.component';
import { AccessRequestsStore } from './access-requests.store';

@Component({
  selector: 'rbth-feat-access-requests-page',
  templateUrl: "./access-requests-page.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [
    AccessRequestSidebarItemComponent,
    ...HlmSidebarImports,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
})
export class AccessRequestsPageComponent {
  readonly store = inject(AccessRequestsStore);
}
