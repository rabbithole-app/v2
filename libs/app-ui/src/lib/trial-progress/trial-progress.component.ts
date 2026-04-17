import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { SubscriptionService } from '@rabbithole/core';
import { HlmButton } from '@spartan-ng/helm/button';

@Component({
  selector: 'rbth-trial-progress',
  imports: [HlmButton, RouterLink],
  template: `
    @if (subscriptionService.isTrial()) {
      <div class="group-data-[collapsible=icon]:hidden px-3 py-2 space-y-2">
        <div class="flex items-center justify-between text-xs">
          <span class="font-medium">Pro Trial</span>
          <span class="text-muted-foreground">{{ daysLabel() }}</span>
        </div>
        <div class="flex items-center justify-between text-xs text-muted-foreground">
          <span>{{ bytesLabel() }}</span>
        </div>
        <div class="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            class="h-full rounded-full transition-all"
            [class.bg-primary]="!isUrgent()"
            [class.bg-amber-500]="isWarning()"
            [class.bg-red-500]="isCritical()"
            [class.animate-pulse]="isCritical()"
            [style.width.%]="progressPercent()"
          ></div>
        </div>
        <a hlmBtn size="sm" variant="outline" class="w-full text-xs" routerLink="/dashboard/subscription">
          Upgrade to Pro
        </a>
      </div>
    }
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrialProgressComponent {
  subscriptionService = inject(SubscriptionService);

  bytesLabel = computed(() => {
    const used = this.subscriptionService.trialUsedBytes();
    return `${(used / (1024 * 1024)).toFixed(0)} / 100 MB`;
  });

  daysLabel = computed(() => {
    const days = this.subscriptionService.trialDaysLeft();
    return days !== null ? `${days}d left` : '';
  });

  isCritical = computed(() => {
    const progress = this.subscriptionService.trialProgress();
    const days = this.subscriptionService.trialDaysLeft();
    return progress >= 0.9 || (days !== null && days <= 1);
  });

  isWarning = computed(() => {
    const progress = this.subscriptionService.trialProgress();
    const days = this.subscriptionService.trialDaysLeft();
    return progress >= 0.5 || (days !== null && days <= 7);
  });

  isUrgent = computed(() => this.isWarning() || this.isCritical());

  progressPercent = computed(() =>
    Math.min(100, this.subscriptionService.trialProgress() * 100),
  );
}
