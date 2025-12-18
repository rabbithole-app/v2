import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { BrnProgress } from '@spartan-ng/brain/progress';
import { HlmItem } from '@spartan-ng/helm/item';
import { HlmItemImports } from '@spartan-ng/helm/item';
import { HlmProgressImports } from '@spartan-ng/helm/progress';

import { CanisterDataInfo, formatTCycles } from '@rabbithole/core';

@Component({
  selector: 'core-canister-health-check',
  hostDirectives: [
    {
      directive: HlmItem,
      inputs: ['variant', 'size', 'class'],
    },
  ],
  imports: [...HlmItemImports, ...HlmProgressImports, BrnProgress],
  templateUrl: './canister-health-check.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CanisterHealthCheckComponent {
  /** Canister data info */
  canister = input.required<CanisterDataInfo>();

  currentBalance = computed(() => {
    const status = this.canister();
    return status.cycles;
  });

  currentBalanceFormatted = computed(() => {
    const balance = this.currentBalance();
    return formatTCycles(balance);
  });

  cyclesNeeded = computed(() => {
    const status = this.canister();
    return status.settings.freezingThreshold;
  });

  cyclesNeededFormatted = computed(() => {
    const needed = this.cyclesNeeded();
    if (needed === 0n) return '0';
    return formatTCycles(needed);
  });

  gracePeriodDays = computed(() => {
    const status = this.canister();
    const days =
      Number(status.settings.freezingThreshold) /
      (24 * 60 * 60 * 1_000_000_000);
    return Math.round(days);
  });

  safetyPercentage = computed(() => {
    const needed = this.cyclesNeeded();
    const current = this.currentBalance();
    if (needed === 0n) return 0;
    const percentage = Number((current * 100n) / needed);
    return Math.round(percentage);
  });

  isSafe = computed(() => {
    return this.safetyPercentage() >= 100;
  });

  progressValue = computed(() => {
    const needed = this.cyclesNeeded();
    const current = this.currentBalance();
    if (needed === 0n) return 100;
    const percentage = Number((current * 100n) / needed);
    return Math.min(percentage, 100);
  });
}
