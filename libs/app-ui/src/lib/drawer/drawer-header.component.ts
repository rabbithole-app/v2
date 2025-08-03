import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';
import { hlm } from '@spartan-ng/brain/core';
import { HlmIcon } from '@spartan-ng/helm/icon';
import type { ClassValue } from 'clsx';

import { RbthDrawerCloseDirective } from './drawer-close.directive';

@Component({
  selector: 'rbth-drawer-header',
  imports: [RbthDrawerCloseDirective, NgIcon, HlmIcon],
  providers: [provideIcons({ lucideX })],
  template: ` <ng-content />
    <button rbthDrawerClose variant="ghost" size="sm">
      <span class="sr-only">Close</span>
      <ng-icon hlm size="sm" name="lucideX" />
    </button>`,
  host: {
    '[class]': '_computedClass()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RbthDrawerHeaderComponent {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });
  protected _computedClass = computed(() =>
    hlm('border-stroke-soft-200 p-5 flex items-start gap-2', this.userClass()),
  );
}
