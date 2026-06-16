import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from "@angular/core";
import { cva } from "class-variance-authority";

import { injectStorageCanisterStatus } from "@rabbithole/core/storage-canister-status";
import { ENCRYPTED_STORAGE_CANISTER_ID } from "@rabbithole/core/storage-canister-token";
import { HlmSidebarService } from "@spartan-ng/helm/sidebar";

import { CanisterCyclesMetricCardComponent } from "./canister-cycles-metric-card.component";
import { StorageMetricCardComponent } from "./storage-metric-card.component";

type StorageCapacityMetricPlacement = "content" | "footer";

const metricCardsShellVariants = cva("flex flex-col gap-2", {
  variants: {
    compact: {
      false: "",
      true: "items-center",
    },
    placement: {
      content: "mt-4",
      footer: "",
    },
  },
  defaultVariants: {
    placement: "content",
  },
});

@Component({
  selector: "rbth-core-storage-capacity-metric",
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./storage-capacity-metric.component.html",
  imports: [CanisterCyclesMetricCardComponent, StorageMetricCardComponent],
})
export class StorageCapacityMetricComponent {
  readonly #canisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID);
  readonly canisterId = this.#canisterId.toText();
  readonly canViewMetrics =
    injectStorageCanisterStatus().isCurrentUserController;

  readonly #sidebarService = inject(HlmSidebarService);
  readonly compactMetrics = computed(
    () =>
      this.#sidebarService.state() === "collapsed" &&
      !this.#sidebarService.isMobile(),
  );

  readonly placement = input<StorageCapacityMetricPlacement>("content");
  readonly shellClass = computed(() =>
    metricCardsShellVariants({
      compact: this.compactMetrics(),
      placement: this.placement(),
    }),
  );
  readonly subscriptionCtaEnabled = input(true);
}
