import { BooleanInput } from '@angular/cdk/coercion';
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { BrnDialogContent, BrnDialogState } from '@spartan-ng/brain/dialog';
import { ClassValue } from 'clsx';

import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { hlm } from '@spartan-ng/helm/utils';

@Component({
  selector: 'hlm-command-dialog',
  imports: [HlmDialogImports, BrnDialogContent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-dialog [state]="_state()" (stateChanged)="stateChanged($event)">
      <hlm-dialog-content
        *hlmDialogPortal="let ctx"
        [class]="_computedDialogContentClass()"
        [showCloseButton]="showCloseButton()"
      >
        <hlm-dialog-header class="sr-only">
          <h2 hlmDialogTitle>{{ title() }}</h2>
          <p hlmDialogDescription>{{ description() }}</p>
        </hlm-dialog-header>
        <ng-content />
      </hlm-dialog-content>
    </hlm-dialog>
  `,
})
export class HlmCommandDialog {
  public readonly description = input<string>('Search for a command to run...');
  public readonly dialogContentClass = input<ClassValue>('');

  public readonly showCloseButton = input<boolean, BooleanInput>(false, {
    transform: booleanAttribute,
  });
  public readonly state = input<BrnDialogState>('closed');

  public readonly stateChange = output<BrnDialogState>();

  public readonly title = input<string>('Command Palette');
  protected readonly _computedDialogContentClass = computed(() =>
    hlm('w-96 p-0', this.dialogContentClass()),
  );

  protected readonly _state = linkedSignal(this.state);

  protected stateChanged(state: BrnDialogState) {
    this.stateChange.emit(state);
    this._state.set(state);
  }
}
