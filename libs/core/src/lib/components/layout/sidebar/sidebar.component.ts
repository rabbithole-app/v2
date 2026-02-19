import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { HlmSeparator } from '@spartan-ng/helm/separator';
import { HlmSidebarImports, HlmSidebarWrapper } from '@spartan-ng/helm/sidebar';

import { AccountMenuComponent } from '../../account/account-menu/account-menu.component';
import { SidebarHeaderComponent } from '../sidebar-header/sidebar-header.component';

@Component({
  selector: 'core-sidebar-layout',
  imports: [
    ...HlmSidebarImports,
    SidebarHeaderComponent,
    RouterOutlet,
    HlmSeparator,
    AccountMenuComponent,
  ],
  templateUrl: './sidebar.component.html',
  hostDirectives: [HlmSidebarWrapper],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarLayoutComponent {}
