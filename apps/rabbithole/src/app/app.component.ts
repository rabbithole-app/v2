import { Component, computed, inject } from "@angular/core";
import { Router, RouterModule } from "@angular/router";

import { HlmToaster } from "@spartan-ng/helm/sonner";
import { HlmSpinner } from "@spartan-ng/helm/spinner";

@Component({
  imports: [RouterModule, HlmToaster, HlmSpinner],
  selector: "app-root",
  template: `
    @if (isNavigating()) {
      <div class="flex h-dvh w-full items-center justify-center">
        <hlm-spinner class="text-[2rem]" />
      </div>
    } @else {
      <router-outlet />
    }
    @defer (on idle) {
      <hlm-toaster position="bottom-center" />
    }
  `,
})
export class AppComponent {
  #router = inject(Router);

  isNavigating = computed(() => !!this.#router.currentNavigation());
}
