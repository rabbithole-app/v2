import type { BooleanInput } from '@angular/cdk/coercion';
import {
  booleanAttribute,
  Directive,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import { BrnDialog } from '@spartan-ng/brain/dialog';

@Directive({
  selector: '[hlmAutocompleteTrigger]',
  host: {
    '(click)': 'open()',
  },
})
export class HlmAutocompleteTrigger {
  /** Whether the trigger is disabled. */
  public readonly disabledTrigger = input<boolean, BooleanInput>(false, {
    transform: booleanAttribute,
  });

  private readonly _brnDialog = inject(BrnDialog, { optional: true });

  private readonly _host = inject(ElementRef, { host: true });

  constructor() {
    if (!this._brnDialog) return;

    this._brnDialog.mutableAttachTo.set(this._host.nativeElement);
  }

  open() {
    if (this.disabledTrigger()) return;

    this._brnDialog?.open();
  }
}
