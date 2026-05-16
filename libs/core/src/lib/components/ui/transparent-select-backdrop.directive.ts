import { Directive } from '@angular/core';

import { setTransparentDialogBackdrop } from './transparent-dialog-backdrop';

@Directive({
  selector: '[coreTransparentSelectBackdrop]',
})
export class CoreTransparentSelectBackdropDirective {
  constructor() {
    setTransparentDialogBackdrop();
  }
}
