import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute } from "@angular/router";
import { map } from "rxjs/operators";

import { StorageCapacityMetricComponent } from "@rabbithole/core/storage-capacity-metric";

@Component({
  selector: "app-storage-metrics-footer",
  template: `
    <rbth-core-storage-capacity-metric
      [canisterId]="canisterId()"
      placement="footer"
    />
  `,
  imports: [StorageCapacityMetricComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorageMetricsFooterComponent {
  readonly #route = inject(ActivatedRoute);
  readonly canisterId = toSignal(
    this.#route.paramMap.pipe(map((params) => params.get("id"))),
    { initialValue: this.#route.snapshot.paramMap.get("id") },
  );
}
