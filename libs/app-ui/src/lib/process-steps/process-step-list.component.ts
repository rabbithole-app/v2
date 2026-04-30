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

@Component({
  selector: 'rbth-process-step-list',
  imports: [NgIcon, RbthStepComponent, ...HlmButtonImports],
  providers: [
    provideIcons({
      lucideRotateCcw,
    }),
  ],
  template: `
    @for (step of steps(); track step.id) {
      <rbth-step [step]="step" />
    }

    @if (errorStep(); as step) {
      @if (step.error) {
        <div class="mt-3 flex items-center justify-between gap-3">
          <p class="text-xs leading-relaxed text-destructive">
            {{ step.error }}
          </p>
          @if (showRetry()) {
            <button
              hlmBtn
              variant="destructive"
              class="shrink-0"
              (click)="retryClicked.emit(step)"
            >
              <ng-icon hlm name="lucideRotateCcw" size="xs" />
              Retry
            </button>
          }
        </div>
      }
    }
  `,
  host: { class: 'block w-full' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProcessStepListComponent {
  readonly steps = input.required<ProcessStep[]>();

  readonly errorStep = computed(
    () => this.steps().find((step) => step.status === 'error') ?? null,
  );

  readonly retryClicked = output<ProcessStep>();

  readonly showRetry = input(true);
}
