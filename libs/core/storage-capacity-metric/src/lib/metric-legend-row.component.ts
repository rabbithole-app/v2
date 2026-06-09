import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { cva, type VariantProps } from 'class-variance-authority';

const metricLegendDotVariants = cva('mr-1.5 h-2 w-2 shrink-0 rounded-full', {
  variants: {
    kind: {
      capacity: 'bg-muted-foreground/25',
      file: 'bg-emerald-500',
      freeze: 'bg-red-500',
      headroom: 'bg-emerald-500',
      included: 'bg-violet-500',
      safeFloor: 'bg-orange-500',
      stable: 'bg-sky-400',
      target: 'bg-sky-500',
    },
  },
});

export type MetricLegendKind = NonNullable<
  VariantProps<typeof metricLegendDotVariants>['kind']
>;

@Component({
  selector: 'core-metric-legend-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex items-center text-[0.72rem] leading-none text-muted-foreground"
    >
      <span [class]="dotClass()"></span>
      <span>{{ label() }}</span>
      <span class="mx-1 h-px flex-1 border-b border-dotted"></span>
      <span class="tabular-nums">{{ value() }}</span>
    </div>
  `,
})
export class MetricLegendRowComponent {
  readonly kind = input.required<MetricLegendKind>();
  readonly dotClass = computed(() =>
    metricLegendDotVariants({ kind: this.kind() }),
  );
  readonly label = input.required<string>();

  readonly value = input.required<string>();
}
