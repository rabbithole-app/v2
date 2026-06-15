import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { HlmSidebarHeader } from '@spartan-ng/helm/sidebar';

@Component({
  selector: 'rbth-core-sidebar-header',
  imports: [RouterLink],
  templateUrl: './sidebar-header.component.html',
  hostDirectives: [HlmSidebarHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarHeaderComponent {}
