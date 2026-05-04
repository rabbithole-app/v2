import { inject } from '@angular/core';
import { BrnDialog } from '@spartan-ng/brain/dialog';

export function setTransparentDialogBackdrop(): void {
  inject(BrnDialog, { host: true }).setOverlayClass('!bg-transparent');
}
