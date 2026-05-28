import {
  ChangeDetectionStrategy,
  Component,
  computed,
  Directive,
  input,
} from '@angular/core';
import type { ClassValue } from 'clsx';

import { hlm } from '@spartan-ng/helm/utils';

@Component({
  selector: 'rbth-metric-card',
  template: `<ng-content />`,
  host: {
    '[class]': '_computedClass()',
    'data-slot': 'metric-card',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RbthMetricCardComponent {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly _computedClass = computed(() =>
    hlm(
      'relative flex flex-col overflow-hidden rounded-lg border bg-sidebar text-sidebar-foreground shadow-xs',
      this.userClass(),
    ),
  );
}

@Directive({
  selector: '[rbthMetricCardHeader]',
  host: {
    '[class]': '_computedClass()',
    'data-slot': 'metric-card-header',
  },
})
export class RbthMetricCardHeaderDirective {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly _computedClass = computed(() =>
    hlm('flex items-center justify-between gap-2 px-3 pt-3', this.userClass()),
  );
}

@Directive({
  selector: '[rbthMetricCardTitle]',
  host: {
    '[class]': '_computedClass()',
    'data-slot': 'metric-card-title',
  },
})
export class RbthMetricCardTitleDirective {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly _computedClass = computed(() =>
    hlm(
      'text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground',
      this.userClass(),
    ),
  );
}

@Directive({
  selector: '[rbthMetricCardContent]',
  host: {
    '[class]': '_computedClass()',
    'data-slot': 'metric-card-content',
  },
})
export class RbthMetricCardContentDirective {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly _computedClass = computed(() =>
    hlm('px-3 pb-3 pt-2', this.userClass()),
  );
}

@Directive({
  selector: '[rbthMetricCardFooter]',
  host: {
    '[class]': '_computedClass()',
    'data-slot': 'metric-card-footer',
  },
})
export class RbthMetricCardFooterDirective {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly _computedClass = computed(() =>
    hlm('border-t bg-muted/50 px-3 py-2', this.userClass()),
  );
}
