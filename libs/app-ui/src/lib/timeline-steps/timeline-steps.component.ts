import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideCircleMinus,
  lucideLoader2,
  lucideX,
} from '@ng-icons/lucide';

import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmProgressImports } from '@spartan-ng/helm/progress';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

import { ProcessStep } from '../process-steps/process-step.types';

@Component({
  selector: 'rbth-timeline-steps',
  imports: [NgIcon, HlmIcon, HlmSpinner, ...HlmProgressImports],
  providers: [
    provideIcons({
      lucideCheck,
      lucideCircleMinus,
      lucideLoader2,
      lucideX,
    }),
  ],
  templateUrl: './timeline-steps.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RbthTimelineStepsComponent {
  readonly steps = input.required<ProcessStep[]>();

  readonly title = input<string>();

  descriptionFor(step: ProcessStep): string | undefined {
    if (step.status === 'completed' && step.completedDescription) {
      return step.completedDescription;
    }

    return step.description;
  }

  progressCopy(step: ProcessStep): string {
    const progress = step.progress;
    if (!progress) return '';

    if (progress.label) {
      return progress.label;
    }

    return `${progress.current} of ${progress.total} completed`;
  }

  progressPercent(step: ProcessStep): number {
    const progress = step.progress;
    if (!progress || progress.total <= 0) {
      return 0;
    }

    return Math.round((progress.current / progress.total) * 100);
  }
}
