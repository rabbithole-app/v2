import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { hlm } from '@spartan-ng/helm/utils';
import { cva } from 'class-variance-authority';
import { ClassValue } from 'clsx';

import { CanisterStatus } from '../../../types';

export const canisterStatusColorVariants = cva('size-1.5 rounded-full', {
  variants: {
    status: {
      running: 'bg-emerald-500',
      stopping: 'bg-amber-500',
      stopped: 'bg-red-500',
    },
  },
  defaultVariants: {
    status: 'stopped',
  },
});

@Component({
  selector: 'core-canister-status',
  hostDirectives: [
    {
      directive: HlmBadge,
      inputs: ['variant', 'class'],
    },
  ],
  template: `
    <span [class]="statusColor()" aria-hidden="true"></span>
    {{ statusText() }}
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': '_computedClass()',
  },
})
export class CoreCanisterStatusComponent {
  status = input.required<CanisterStatus>();
  statusColor = computed(() =>
    canisterStatusColorVariants({ status: this.status() }),
  );
  readonly statusMap: Record<CanisterStatus, string> = {
    running: 'Running',
    stopping: 'Stopping',
    stopped: 'Stopped',
  };
  statusText = computed(() => this.statusMap[this.status()]);
  readonly userClass = input<ClassValue>('', { alias: 'class' });
  protected readonly _computedClass = computed(() =>
    hlm('flex items-center gap-1.5', this.userClass()),
  );
}
