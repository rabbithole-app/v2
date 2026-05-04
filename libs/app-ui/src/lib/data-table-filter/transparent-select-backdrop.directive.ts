import { Directive } from '@angular/core';

import { setTransparentDialogBackdrop } from '@rabbithole/core/ui';

@Directive({
  selector: '[rbthTransparentSelectBackdrop]',
})
export class RbthTransparentSelectBackdropDirective {
  constructor() {
    setTransparentDialogBackdrop();
  }
}
