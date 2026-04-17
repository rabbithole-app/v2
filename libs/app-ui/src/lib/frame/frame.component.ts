import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { ClassValue } from 'clsx';

import { hlm } from '@spartan-ng/helm/utils';

@Component({
  selector: 'rbth-frame',
  template: `<ng-content />`,
  host: {
    '[class]': '_computedClass()',
    'data-slot': 'frame',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RbthFrameComponent {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly _computedClass = computed(() =>
    hlm(
      'relative flex flex-col rounded-2xl bg-muted/72 p-1',
      '*:[[data-slot=frame-panel]+[data-slot=frame-panel]]:mt-1',
      this.userClass()
    )
  );
}
