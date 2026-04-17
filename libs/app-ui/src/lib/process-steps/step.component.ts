import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  input,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideCircleCheck,
  lucideCircleDashed,
  lucideCircleMinus,
  lucideCircleX,
  lucideCopy,
  lucideLoader2,
} from '@ng-icons/lucide';
import { cva } from 'class-variance-authority';

import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmItemImports } from '@spartan-ng/helm/item';
import { HlmProgressImports } from '@spartan-ng/helm/progress';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { hlm } from '@spartan-ng/helm/utils';

import { RbthFramePanelDirective } from '../frame/frame-panel.directive';
import {
  ProcessStep,
  ProcessStepStatus,
  ProcessStepTemplateContext,
} from './process-step.types';
import { RbthStepMetaDirective } from './step-meta.directive';
import { RbthStepProgressDirective } from './step-progress.directive';

const stepPanelVariants = cva('transition-colors', {
  variants: {
    status: {
      completed: '',
      error: 'border-destructive/30 bg-destructive/5',
      'in-progress': 'border-primary/30 bg-primary/5',
      pending: 'opacity-60',
      skipped: '',
    },
  },
});

const stepTitleVariants = cva('font-medium text-sm', {
  variants: {
    status: {
      completed: 'text-foreground',
      error: 'text-foreground',
      'in-progress': 'text-foreground',
      pending: 'text-foreground',
      skipped: 'text-muted-foreground',
    },
  },
});

@Component({
  selector: 'rbth-step',
  imports: [
    NgIcon,
    NgTemplateOutlet,
    RbthFramePanelDirective,
    HlmBadge,
    HlmIcon,
    HlmSpinner,
    ...HlmItemImports,
    ...HlmProgressImports,
  ],
  providers: [
    provideIcons({
      lucideCheck,
      lucideCopy,
      lucideCircleCheck,
      lucideCircleDashed,
      lucideCircleMinus,
      lucideCircleX,
      lucideLoader2,
    }),
  ],
  templateUrl: './step.component.html',
  host: { class: 'block not-first:mt-1' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RbthStepComponent {
  readonly step = input.required<ProcessStep>();

  readonly description = computed(() => {
    const step = this.step();
    if (step.status === 'completed' && step.completedDescription) {
      return step.completedDescription;
    }

    return step.description;
  });

  readonly hasError = computed(() => this.step().status === 'error');

  readonly isActive = computed(() => this.step().status === 'in-progress');

  readonly isComplete = computed(() => this.step().status === 'completed');

  readonly progressPercent = computed(() => {
    const progress = this.step().progress;
    if (!progress || progress.total <= 0) {
      return 0;
    }

    return Math.round((progress.current / progress.total) * 100);
  });

  readonly metaContext = computed<ProcessStepTemplateContext>(() => ({
    $implicit: this.step(),
    percent: this.progressPercent(),
    progress: this.step().progress ?? null,
    step: this.step(),
  }));

  readonly metaTemplate = contentChild(RbthStepMetaDirective);

  readonly progressContext = computed<ProcessStepTemplateContext>(() => ({
    $implicit: this.step(),
    percent: this.progressPercent(),
    progress: this.step().progress ?? null,
    step: this.step(),
  }));

  readonly progressCopy = computed(() => {
    const progress = this.step().progress;
    if (!progress) return '';

    if (progress.label) {
      return progress.label;
    }

    return `${progress.current} of ${progress.total} completed`;
  });

  readonly progressTemplate = contentChild(RbthStepProgressDirective);

  stepPanelClass(status: ProcessStepStatus): string {
    return hlm(stepPanelVariants({ status }));
  }

  stepTitleClass(status: ProcessStepStatus): string {
    return hlm(stepTitleVariants({ status }));
  }
}
