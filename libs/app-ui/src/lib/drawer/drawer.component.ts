import {
  ChangeDetectionStrategy,
  Component,
  forwardRef,
  ViewEncapsulation,
} from '@angular/core';
import {
  BrnDialogComponent,
  provideBrnDialogDefaultOptions,
} from '@spartan-ng/brain/dialog';
import {
  BrnSheetComponent,
  BrnSheetOverlayComponent,
} from '@spartan-ng/brain/sheet';

import { RbthDrawerOverlayDirective } from './drawer-overlay.directive';

@Component({
  selector: 'rbth-drawer',
  imports: [BrnSheetOverlayComponent, RbthDrawerOverlayDirective],
  providers: [
    {
      provide: BrnDialogComponent,
      useExisting: forwardRef(() => BrnSheetComponent),
    },
    {
      provide: BrnSheetComponent,
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
export class RbthDrawerComponent extends BrnSheetComponent {}
