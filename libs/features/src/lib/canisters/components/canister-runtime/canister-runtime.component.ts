import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { HlmItem } from '@spartan-ng/helm/item';
import { HlmItemImports } from '@spartan-ng/helm/item';

import { CoreCanisterStatusComponent } from '../canister-status';
import { CanisterDataInfo, formatBytes, formatTCycles } from '@rabbithole/core';

@Component({
  selector: 'core-canister-runtime',
  hostDirectives: [
    {
      directive: HlmItem,
      inputs: ['variant', 'size', 'class'],
    },
  ],
  imports: [...HlmItemImports, CoreCanisterStatusComponent],
  templateUrl: './canister-runtime.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CanisterRuntimeComponent {
  /** Canister data info */
  canister = input.required<CanisterDataInfo>();

  availableCycles = computed(() => {
    const status = this.canister();
    return `${formatTCycles(status.cycles)} TCycles`;
  });

  dailyIdleConsumption = computed(() => {
    const status = this.canister();
    if (!status.idleCyclesBurnedPerDay) return '0.000 TCycles';
    return `${formatTCycles(status.idleCyclesBurnedPerDay)} TCycles`;
  });

  queriesCalls = computed(() => {
    const status = this.canister();
    return status.queryStats.numCallsTotal.toString();
  });

  queriesInstructions = computed(() => {
    const status = this.canister();
    const instructions = Number(status.queryStats.numInstructionsTotal);
    if (instructions >= 1_000_000) {
      return `${(instructions / 1_000_000).toFixed(2)}M`;
    }
    if (instructions >= 1_000) {
      return `${(instructions / 1_000).toFixed(2)}K`;
    }
    return instructions.toString();
  });

  queriesRequests = computed(() => {
    const status = this.canister();
    return formatBytes(Number(status.queryStats.requestPayloadBytesTotal));
  });

  queriesResponses = computed(() => {
    const status = this.canister();
    return formatBytes(Number(status.queryStats.responsePayloadBytesTotal));
  });
}
