import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  computed,
  HostListener,
  inject,
  input,
  Signal,
} from '@angular/core';
import { BrnDialogState } from '@spartan-ng/brain/dialog';
import { BrnSheetContentDirective } from '@spartan-ng/brain/sheet';
import {
  HlmSheetComponent,
  HlmSheetContentComponent,
} from '@spartan-ng/ui-sheet-helm';
import { ClassValue } from 'clsx';

import {
  RbthSidebarBaseComponent,
  SidebarVariants,
} from './sidebar-base.component';
import { SidebarService } from './sidebar.service';
import { injectSidebarConfig, SidebarConfig } from './sidebar.token';
import { injectIsMobile } from './utils';

const SIDEBAR_WIDTH = '16rem';
const SIDEBAR_WIDTH_MOBILE = '18rem';
const SIDEBAR_WIDTH_ICON = '3.5rem';
const SIDEBAR_KEYBOARD_SHORTCUT = 'b';

@Component({
  selector: 'rbth-sidebar',
  imports: [
    NgTemplateOutlet,
    // BrnSheetOverlayComponent,
    // BrnSheetTriggerDirective,
    BrnSheetContentDirective,
    HlmSheetComponent,
    HlmSheetContentComponent,
    // HlmSheetTitleDirective,
    RbthSidebarBaseComponent,
  ],
  templateUrl: './sidebar.component.html',
  host: {
    '[style]': 'styleWidth',
  },
})
export class RbthSidebarComponent {
  private readonly _config = injectSidebarConfig();
  collapsible = input<NonNullable<SidebarVariants['collapsible']>>(
    this._config.collapsible
  );
  isMobile = injectIsMobile();
  sidebarService = inject(SidebarService);
  sheetState: Signal<BrnDialogState> = computed(
    () => this.sidebarService.state().sheetState
  );
  side = input<SidebarConfig['side']>(this._config.side);
  readonly styleWidth = `--sidebar-width: ${SIDEBAR_WIDTH}; --sidebar-width-icon: ${SIDEBAR_WIDTH_ICON};`;
  readonly styleWidthMobile = `--sidebar-width: ${SIDEBAR_WIDTH_MOBILE};`;
  // eslint-disable-next-line @angular-eslint/no-input-rename
  readonly userClass = input<ClassValue>('', { alias: 'class' });
  variant = input<SidebarConfig['variant']>(this._config.variant);

  @HostListener(`window:keydown.control.${SIDEBAR_KEYBOARD_SHORTCUT}`, [
    '$event',
  ])
  @HostListener(`window:keydown.meta.${SIDEBAR_KEYBOARD_SHORTCUT}`, ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    event.preventDefault();
    this.sidebarService.toggle();
  }
}
