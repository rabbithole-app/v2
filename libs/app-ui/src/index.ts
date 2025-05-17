import { NgModule } from '@angular/core';

import {
  RbthSidebarContentDirective,
  RbthSidebarFooterDirective,
  RbthSidebarGroupActionDirective,
  RbthSidebarGroupContentDirective,
  RbthSidebarGroupDirective,
  RbthSidebarGroupLabelDirective,
  RbthSidebarHeaderDirective,
  RbthSidebarInputDirective,
  RbthSidebarInsetComponent,
  RbthSidebarMenuButtonDirective,
  RbthSidebarMenuDirective,
  RbthSidebarMenuItemDirective,
  RbthSidebarRailComponent,
  RbthSidebarSeparatorDirective,
  RbthSidebarTriggerComponent,
} from './lib/sidebar';
import { RbthSidebarComponent } from './lib/sidebar/sidebar.component';
export * from './lib/sidebar';

const RbthSidebarLayoutImports = [
  RbthSidebarComponent,
  RbthSidebarContentDirective,
  RbthSidebarFooterDirective,
  RbthSidebarGroupActionDirective,
  RbthSidebarGroupContentDirective,
  RbthSidebarGroupDirective,
  RbthSidebarGroupLabelDirective,
  RbthSidebarHeaderDirective,
  RbthSidebarInputDirective,
  RbthSidebarInsetComponent,
  RbthSidebarMenuButtonDirective,
  RbthSidebarMenuDirective,
  RbthSidebarMenuItemDirective,
  RbthSidebarRailComponent,
  RbthSidebarSeparatorDirective,
  RbthSidebarTriggerComponent,
] as const;

@NgModule({
  imports: [...RbthSidebarLayoutImports],
  exports: [...RbthSidebarLayoutImports],
})
export class RbthSidebarLayoutModule {}

export { RbthTooltipTriggerDirective } from './lib/tooltip/tooltip-trigger.directive';
export { RbthTooltipComponent } from './lib/tooltip/tooltip.component';
