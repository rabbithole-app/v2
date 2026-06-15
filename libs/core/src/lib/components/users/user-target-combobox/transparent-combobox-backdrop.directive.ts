import { Directive } from '@angular/core';

import { setTransparentDialogBackdrop } from '../../ui/transparent-dialog-backdrop';

@Directive({
  selector: '[rbthCoreTransparentComboboxBackdrop]',
})
export class CoreTransparentComboboxBackdropDirective {
  constructor() {
    setTransparentDialogBackdrop();
  }
}
