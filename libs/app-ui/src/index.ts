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

export * from './lib/copy-to-clipboard';
export * from './lib/drawer';
export * from './lib/file-upload';
export * from './lib/progress';
export * from './lib/sidebar';
export * from './lib/toaster';
export * from './lib/tooltip';
export * from './lib/tree';
export * from './lib/upload-item';
export * from './lib/users-table';
