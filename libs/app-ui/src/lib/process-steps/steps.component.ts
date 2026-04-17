import { ChangeDetectionStrategy, Component } from '@angular/core';

import { RbthFrameComponent } from '../frame/frame.component';
import { RbthStepsDescriptionDirective } from './steps-description.directive';
import { RbthStepsFooterDirective } from './steps-footer.directive';
import { RbthStepsHeaderDirective } from './steps-header.directive';
import { RbthStepsTitleDirective } from './steps-title.directive';

@Component({
  selector: 'rbth-steps',
  imports: [
    RbthFrameComponent,
    RbthStepsDescriptionDirective,
    RbthStepsFooterDirective,
    RbthStepsHeaderDirective,
    RbthStepsTitleDirective,
  ],
  template: `
    <rbth-frame
      class="w-full *:[[data-slot=frame-panel]+[data-slot=steps-footer]]:mt-1"
    >
      <ng-content />
    </rbth-frame>
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RbthStepsComponent {}
