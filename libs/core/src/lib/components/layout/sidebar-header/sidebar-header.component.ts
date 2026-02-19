import { ChangeDetectionStrategy, Component } from '@angular/core';

import { HlmSidebarHeader } from '@spartan-ng/helm/sidebar';

@Component({
  selector: 'core-sidebar-header',
  templateUrl: './sidebar-header.component.html',
  hostDirectives: [HlmSidebarHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarHeaderComponent {}
