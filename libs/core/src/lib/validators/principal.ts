import { AbstractControl, ValidationErrors } from '@angular/forms';

import { isPrincipal } from '@rabbithole/core';

export function principalValidator(
  control: AbstractControl,
): ValidationErrors | null {
  return isPrincipal(control.value) ? null : { principal: true };
}
