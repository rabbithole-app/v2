import { AbstractControl, ValidationErrors } from '@angular/forms';
import { isIcpAccountIdentifier } from '@dfinity/ledger-icp';

import { isPrincipal } from '../utils';

/**
 * Checks if a string is a valid recipient (Principal or AccountIdentifier)
 */
export const isValidRecipient = (value: string): boolean => {
  if (!value) return false;
  return isPrincipal(value) || isIcpAccountIdentifier(value);
};

/**
 * Angular validator for checking recipient (Principal or AccountIdentifier)
 */
export function recipientValidator(
  control: AbstractControl,
): ValidationErrors | null {
  const value = control.value?.trim();
  if (!value) return null; // Empty value is skipped, Validators.required handles this

  return isValidRecipient(value) ? null : { recipient: true };
}
