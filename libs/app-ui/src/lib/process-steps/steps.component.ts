import { ChangeDetectionStrategy, Component } from '@angular/core';

import { RbthFrameComponent } from '../frame/frame.component';

@Component({
  selector: 'rbth-steps',
  imports: [RbthFrameComponent],
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
