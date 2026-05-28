import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from "@angular/core";
import { cva } from "class-variance-authority";

import { HlmSidebarService } from "@spartan-ng/helm/sidebar";

import { SIDEBAR_SUBSCRIPTION_LINK_TOKEN } from "../../tokens/backend-features";
import { ENCRYPTED_STORAGE_CANISTER_ID } from "../../tokens/encrypted-storage-canister";
import { CanisterCyclesMetricCardComponent } from "./canister-cycles-metric-card.component";
import { StorageMetricCardComponent } from "./storage-metric-card.component";

const metricCardsShellVariants = cva("mx-2 mt-4 flex flex-col gap-2", {
  variants: {
    compact: {
      false: "",
      true: "items-center",
    },
  },
});

@Component({
  selector: "core-storage-capacity-metric",
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./storage-capacity-metric.component.html",
  imports: [CanisterCyclesMetricCardComponent, StorageMetricCardComponent],
})
export class StorageCapacityMetricComponent {
  readonly canisterId = input<string | null>(null);

  readonly #sidebarService = inject(HlmSidebarService);
  readonly compactMetrics = computed(
    () =>
      this.#sidebarService.state() === "collapsed" &&
      !this.#sidebarService.isMobile(),
  );

  readonly #providedCanisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID, {
    optional: true,
  });
  readonly effectiveCanisterId = computed(
    () => this.canisterId() ?? this.#providedCanisterId?.toText() ?? null,
  );
  readonly shellClass = computed(() =>
    metricCardsShellVariants({ compact: this.compactMetrics() }),
  );
  readonly subscriptionLink = inject(SIDEBAR_SUBSCRIPTION_LINK_TOKEN);
}
