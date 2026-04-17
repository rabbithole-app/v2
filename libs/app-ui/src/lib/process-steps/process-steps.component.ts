import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideRotateCcw } from '@ng-icons/lucide';

import { HlmButtonImports } from '@spartan-ng/helm/button';

import { ProcessStep } from './process-step.types';
import { RbthStepComponent } from './step.component';
import { RbthStepsDescriptionDirective } from './steps-description.directive';
import { RbthStepsFooterDirective } from './steps-footer.directive';
import { RbthStepsHeaderDirective } from './steps-header.directive';
import { RbthStepsTitleDirective } from './steps-title.directive';
import { RbthStepsComponent } from './steps.component';

@Component({
  selector: 'rbth-process-steps',
  imports: [
    NgIcon,
    RbthStepComponent,
    RbthStepsComponent,
    RbthStepsDescriptionDirective,
    RbthStepsFooterDirective,
    RbthStepsHeaderDirective,
    RbthStepsTitleDirective,
    ...HlmButtonImports,
  ],
  providers: [
    provideIcons({
      lucideRotateCcw,
    }),
  ],
  templateUrl: './process-steps.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProcessStepsComponent {
  readonly steps = input.required<ProcessStep[]>();

  readonly completedCount = computed(
    () => this.steps().filter((step) => step.status === 'completed').length,
  );

  readonly errorStep = computed(
    () => this.steps().find((step) => step.status === 'error') ?? null,
  );

  readonly hasError = computed(() =>
    this.steps().some((step) => step.status === 'error'),
  );

  readonly totalCount = computed(() => this.steps().length);

  readonly headerStatusLabel = computed(() => {
    const total = this.totalCount();
    const completed = this.completedCount();

    if (this.hasError()) {
      return `Step ${Math.min(completed + 1, total)} of ${total}`;
    }

    if (completed === total) {
      return `Completed ${total} of ${total} steps`;
    }

    return `Step ${completed + 1} of ${total}`;
  });

  readonly retryClicked = output<ProcessStep>();

  readonly showRetry = input(true);

  readonly title = input('Processing');
}
