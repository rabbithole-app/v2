import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Principal } from '@dfinity/principal';
import { BrnProgress } from '@spartan-ng/brain/progress';
import { HlmItemImports } from '@spartan-ng/helm/item';
import { HlmProgressImports } from '@spartan-ng/helm/progress';
import { filter, map, mergeWith, tap } from 'rxjs';

import { AUTH_SERVICE } from '@rabbithole/auth';
import {
  CanisterDataInfo,
  ENCRYPTED_STORAGE_CANISTER_ID,
  formatTCycles,
  ICManagementService,
} from '@rabbithole/core';
import {
  CanisterControllersTableComponent,
  CanisterMemoryComponent,
} from '@rabbithole/shared';
import { formatBytes, RbthCanisterStatusComponent } from '@rabbithole/ui';

@Component({
  selector: 'app-canister-detail',
  templateUrl: './canister-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ...HlmItemImports,
    ...HlmProgressImports,
    BrnProgress,
    RbthCanisterStatusComponent,
    CanisterMemoryComponent,
    CanisterControllersTableComponent,
  ],
  providers: [
    {
      provide: ENCRYPTED_STORAGE_CANISTER_ID,
      useFactory: () => {
        const route = inject(ActivatedRoute);
        const canisterId = route.snapshot.paramMap.get('id');
        if (!canisterId) {
          throw new Error('Canister ID parameter is required');
        }
        return Principal.fromText(canisterId);
      },
    },
    ICManagementService,
  ],
})
export class CanisterDetailComponent {
  #icManagementService = inject(ICManagementService);
  #route = inject(ActivatedRoute);

  // Combines initial data from resolver with reactive updates from service resource
  canisterStatus = toSignal(
    this.#route.data.pipe(
      map((data) => data['canisterStatus'] as CanisterDataInfo),
      mergeWith(
        toObservable(this.#icManagementService.canisterStatus.value).pipe(
          filter((v) => !!v),
        ),
      ),
    ),
    { requireSync: true },
  );

  availableCycles = computed(() => {
    const status = this.canisterStatus();
    if (!status) return '0 TCycles';
    return `${formatTCycles(status.cycles)} TCycles`;
  });

  controllers = computed(() => {
    const status = this.canisterStatus();
    return status?.settings.controllers ?? [];
  });

  currentBalance = computed(() => {
    const status = this.canisterStatus();
    return status?.cycles ?? 0n;
  });

  currentBalanceFormatted = computed(() => {
    const balance = this.currentBalance();
    return formatTCycles(balance);
  });

  #authService = inject(AUTH_SERVICE);

  currentPrincipalId = computed(() => {
    return this.#authService.principalId();
  });

  cyclesNeeded = computed(() => {
    const status = this.canisterStatus();
    if (!status) return 0n;
    // Calculate cycles needed based on freezing threshold
    // This is a simplified calculation
    return status.settings.freezingThreshold;
  });
  cyclesNeededFormatted = computed(() => {
    const needed = this.cyclesNeeded();
    if (needed === 0n) return '0';
    return formatTCycles(needed);
  });

  dailyIdleConsumption = computed(() => {
    const status = this.canisterStatus();
    if (!status?.idleCyclesBurnedPerDay) return '0.000 TCycles';
    return `${formatTCycles(status.idleCyclesBurnedPerDay)} TCycles`;
  });

  gracePeriodDays = computed(() => {
    const status = this.canisterStatus();
    if (!status) return 0;
    // freezingThreshold is in nanoseconds, convert to days
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

  loadingState = computed(() => {
    return this.#icManagementService.state().loading;
  });

  progressValue = computed(() => {
    const needed = this.cyclesNeeded();
    const current = this.currentBalance();
    if (needed === 0n) return 100;
    const percentage = Number((current * 100n) / needed);
    return Math.min(percentage, 100);
  });

  queriesCalls = computed(() => {
    const status = this.canisterStatus();
    if (!status) return '0';
    return status.queryStats.numCallsTotal.toString();
  });

  queriesInstructions = computed(() => {
    const status = this.canisterStatus();
    if (!status) return '0';
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
    const status = this.canisterStatus();
    if (!status) return '0 Bytes';
    return formatBytes(Number(status.queryStats.requestPayloadBytesTotal));
  });

  queriesResponses = computed(() => {
    const status = this.canisterStatus();
    if (!status) return '0 Bytes';
    return formatBytes(Number(status.queryStats.responsePayloadBytesTotal));
  });

  protected _handleAddController(principal: Principal) {
    this.#icManagementService.addController(principal);
  }

  protected _handleRemoveController(principal: Principal) {
    this.#icManagementService.removeController(principal);
  }
}
