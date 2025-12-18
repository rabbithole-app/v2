import { Directive } from '@angular/core';

import { RbthDrawerComponent } from '@rabbithole/ui';

@Directive({
  selector: '[coreFrontendUploadTrigger]',
  host: {
    '(click)': 'open()',
  },
})
export class FrontendUploadTriggerDirective {
  private _drawer?: RbthDrawerComponent;

  open() {
    this._drawer?.open();
  }

  setDrawer(drawer: RbthDrawerComponent) {
    this._drawer = drawer;
  }
}

