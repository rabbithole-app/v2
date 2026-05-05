import { Directive, inject } from '@angular/core';
import { BrnDialog } from '@spartan-ng/brain/dialog';

@Directive({
  selector: '[rbthTransparentSelectBackdrop]',
})
export class RbthTransparentSelectBackdropDirective {
  constructor() {
    inject(BrnDialog, { host: true }).setOverlayClass('!bg-transparent');
  }
}
