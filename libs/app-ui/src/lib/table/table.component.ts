import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  ViewEncapsulation,
} from '@angular/core';
import type { ClassValue } from 'clsx';

import { hlm } from '@spartan-ng/helm/utils';

@Component({
  selector: 'rbth-table',
  standalone: true,
  host: {
    '[class]': '_computedClass()',
  },
  template: `<table data-slot="table" class="w-full caption-bottom text-sm">
    <ng-content />
  </table>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class RbthTableComponent {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });
  protected readonly _computedClass = computed(() =>
    hlm('relative w-full overflow-auto', this.userClass()),
  );
}
