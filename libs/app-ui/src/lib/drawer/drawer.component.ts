import {
  ChangeDetectionStrategy,
  Component,
  forwardRef,
  ViewEncapsulation,
} from '@angular/core';
import {
  BrnDialog,
  provideBrnDialogDefaultOptions,
} from '@spartan-ng/brain/dialog';
import { BrnSheet, BrnSheetOverlay } from '@spartan-ng/brain/sheet';

import { RbthDrawerOverlayDirective } from './drawer-overlay.directive';

@Component({
  selector: 'rbth-drawer',
  imports: [BrnSheetOverlay, RbthDrawerOverlayDirective],
  providers: [
    {
      provide: BrnDialog,
      useExisting: forwardRef(() => BrnSheet),
    },
    {
      provide: BrnSheet,
      useExisting: forwardRef(() => RbthDrawerComponent),
    },
    provideBrnDialogDefaultOptions({
      // add custom options here
    }),
  ],
  template: `
    <brn-sheet-overlay rbthDrawerOverlay />
    <ng-content />
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  exportAs: 'rbthDrawer',
})
export class RbthDrawerComponent extends BrnSheet {}
