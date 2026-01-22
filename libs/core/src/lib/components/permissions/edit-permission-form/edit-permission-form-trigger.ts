import { Directive, inject } from '@angular/core';

import { HlmButton } from '@spartan-ng/helm/button';

import { EditPermissionFormComponent } from './edit-permission-form';

@Directive({
  selector: '[coreEditPermissionFormTrigger]',
  host: {
    '(click)': 'handleClick()',
  },
  hostDirectives: [{ directive: HlmButton, inputs: ['variant', 'size'] }],
})
export class EditPermissionFormTriggerDirective {
  editPermissionFormComponent = inject(EditPermissionFormComponent);

  handleClick() {
    this.editPermissionFormComponent.dialog().open();
  }
}
