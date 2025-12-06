import { Directive } from '@angular/core';

import { RbthDrawerComponent } from '@rabbithole/ui';

@Directive({
  selector: '[coreWasmInstallTrigger]',
  host: {
    '(click)': 'open()',
  },
})
export class WasmInstallTriggerDirective {
  private _drawer?: RbthDrawerComponent;

  open() {
    this._drawer?.open();
  }

  setDrawer(drawer: RbthDrawerComponent) {
    this._drawer = drawer;
  }
}
