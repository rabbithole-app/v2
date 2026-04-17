import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  type OnInit,
  output,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArchive,
  lucideChevronRight,
  lucideCircleCheckBig,
  lucideCircleDashed,
  lucideEllipsis,
  lucideMail,
} from '@ng-icons/lucide';

import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCollapsibleImports } from '@spartan-ng/helm/collapsible';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmIcon } from '@spartan-ng/helm/icon';

export interface OnboardingStep {
  actionLabel: string;
  completed: boolean;
  description: string;
  id: string;
  title: string;
}

@Component({
  selector: 'rbth-onboarding-checklist',
  imports: [
    NgIcon,
    HlmIcon,
    ...HlmButtonImports,
    ...HlmCollapsibleImports,
    ...HlmDropdownMenuImports,
  ],
  providers: [
    provideIcons({
      lucideArchive,
      lucideChevronRight,
      lucideCircleCheckBig,
      lucideCircleDashed,
      lucideEllipsis,
      lucideMail,
    }),
  ],
  template: `
    @if (!dismissed()) {
      <div class="w-full max-w-lg">
        <div class="rounded-lg border bg-card p-4 text-card-foreground shadow-xs">
          <!-- Header -->
          <div class="mr-2 mb-4 flex flex-col justify-between sm:flex-row sm:items-center">
            <h3 class="ml-2 text-balance font-semibold text-foreground">
              {{ title() }}
            </h3>
            <div class="mt-2 flex items-center justify-end sm:mt-0">
              <!-- Circular Progress -->
              <svg
                class="-rotate-90"
                height="14"
                viewBox="0 0 14 14"
                width="14"
              >
                <circle
                  class="stroke-muted"
                  cx="7"
                  cy="7"
                  fill="none"
                  pathLength="100"
                  r="6"
                  stroke-width="2"
                />
                <circle
                  class="stroke-primary"
                  cx="7"
                  cy="7"
                  fill="none"
                  pathLength="100"
                  r="6"
                  stroke-dasharray="100"
                  stroke-linecap="round"
                  stroke-width="2"
                  [style.stroke-dashoffset]="strokeDashoffset()"
                />
              </svg>
              <div class="mr-3 ml-1.5 text-muted-foreground text-sm">
                <span class="font-medium text-foreground">{{ completedCount() }}</span>
                {{ ' / ' }}
                <span class="font-medium text-foreground">{{ totalCount() }}</span>
                completed
              </div>
              <!-- Dropdown Menu -->
              <button
                hlmBtn
                variant="ghost"
                size="icon"
                class="h-6 w-6"
                [hlmDropdownMenuTrigger]="menu"
              >
                <ng-icon hlm name="lucideEllipsis" size="sm" />
                <span class="sr-only">Options</span>
              </button>
              <ng-template #menu>
                <hlm-dropdown-menu class="w-40">
                  <button hlmDropdownMenuItem (click)="dismiss()">
                    <ng-icon hlm name="lucideArchive" class="mr-2" size="sm" />
                    Dismiss
                  </button>
                  <button hlmDropdownMenuItem (click)="feedbackClicked.emit()">
                    <ng-icon hlm name="lucideMail" class="mr-2" size="sm" />
                    Give feedback
                  </button>
                </hlm-dropdown-menu>
              </ng-template>
            </div>
          </div>

          <!-- Steps -->
          <div class="space-y-0">
            @for (step of currentSteps(); track step.id; let i = $index) {
              @let isOpen = openStepId() === step.id;
              @let isFirst = i === 0;
              @let prevStep = i > 0 ? currentSteps()[i - 1] : null;
              @let isPrevOpen = prevStep && openStepId() === prevStep.id;
              @let showBorderTop = !(isFirst || isOpen || isPrevOpen);

              <div
                class="group"
                [class.rounded-lg]="isOpen"
                [class.border-t]="showBorderTop"
                [class.border-border]="showBorderTop"
              >
                <hlm-collapsible
                  [expanded]="isOpen"
                  class="block w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  [class.rounded-lg]="isOpen"
                >
                  <div
                    class="relative overflow-hidden rounded-lg transition-colors"
                    [class.border]="isOpen"
                    [class.border-border]="isOpen"
                    [class.bg-muted]="isOpen"
                    tabindex="0"
                    role="button"
                    (click)="handleStepClick(step.id)"
                    (keydown.enter)="handleStepClick(step.id)"
                    (keydown.space)="handleStepClick(step.id); $event.preventDefault()"
                  >
                    <div class="relative flex items-center justify-between gap-3 py-3 pr-2 pl-4">
                      <div class="flex w-full gap-3">
                        <div class="shrink-0 mt-1">
                          @if (step.completed) {
                            <ng-icon
                              hlm
                              name="lucideCircleCheckBig"
                              class="size-4.5 text-primary"
                            />
                          } @else {
                            <ng-icon
                              name="lucideCircleDashed"
                              class="size-5 stroke-muted-foreground/40"
                              [strokeWidth]="2"
                            />
                          }
                        </div>
                        <div class="mt-0.5 grow">
                          <h4
                            class="font-semibold"
                            [class.text-primary]="step.completed"
                            [class.text-foreground]="!step.completed"
                          >
                            {{ step.title }}
                          </h4>
                          <hlm-collapsible-content>
                            <p class="mt-2 text-pretty text-muted-foreground text-sm sm:max-w-64 md:max-w-xs">
                              {{ step.description }}
                            </p>
                            <button
                              hlmBtn
                              size="sm"
                              class="mt-3"
                              (click)="handleStepAction(step, $event)"
                            >
                              {{ step.actionLabel }}
                            </button>
                          </hlm-collapsible-content>
                        </div>
                      </div>
                      @if (!isOpen) {
                        <ng-icon
                          hlm
                          name="lucideChevronRight"
                          class="shrink-0 text-muted-foreground"
                          size="sm"
                        />
                      }
                    </div>
                  </div>
                </hlm-collapsible>
              </div>
            }
          </div>
        </div>
      </div>
    } @else {
      <!-- Dismissed state -->
      <div class="text-center">
        <p class="text-pretty text-muted-foreground">
          Checklist dismissed
        </p>
        <button
          class="mt-2 text-primary text-sm underline"
          (click)="dismissed.set(false)"
        >
          Show again
        </button>
      </div>
    }
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingChecklistComponent implements OnInit {
  readonly currentSteps = signal<OnboardingStep[]>([]);

  readonly completedCount = computed(
    () => this.currentSteps().filter((s) => s.completed).length,
  );

  readonly dismissed = model(false);

  readonly feedbackClicked = output<void>();

  readonly openStepId = signal<string | null>(null);

  readonly totalCount = computed(() => this.currentSteps().length);

  readonly remainingCount = computed(
    () => this.totalCount() - this.completedCount(),
  );

  readonly stepCompleted = output<OnboardingStep>();

  readonly steps = input.required<OnboardingStep[]>();

  readonly strokeDashoffset = computed(() => {
    const total = this.totalCount();
    const remaining = this.remainingCount();
    const progress = total > 0 ? ((total - remaining) / total) * 100 : 0;
    return 100 - progress;
  });

  readonly title = input('Get started');

  dismiss(): void {
    this.dismissed.set(true);
  }

  handleStepAction(step: OnboardingStep, event: Event): void {
    event.stopPropagation();

    const updated = this.currentSteps().map((s) =>
      s.id === step.id ? { ...s, completed: true } : s,
    );
    this.currentSteps.set(updated);

    const nextIncomplete = updated.find((s) => !s.completed);
    this.openStepId.set(nextIncomplete?.id ?? null);

    this.stepCompleted.emit({ ...step, completed: true });
  }

  handleStepClick(stepId: string): void {
    this.openStepId.set(this.openStepId() === stepId ? null : stepId);
  }

  ngOnInit(): void {
    this.currentSteps.set([...this.steps()]);
    this.#initializeOpenStep();
  }

  #initializeOpenStep(): void {
    const firstIncomplete = this.currentSteps().find((s) => !s.completed);
    this.openStepId.set(firstIncomplete?.id ?? this.currentSteps()[0]?.id ?? null);
  }
}
