import { Component, computed, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';

import { RbthToaster } from '@rabbithole/ui';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

@Component({
  imports: [RouterModule, RbthToaster, HlmSpinner],
  selector: 'app-root',
  template: `
    @if (isNavigating()) {
      <div class="flex h-dvh w-full items-center justify-center">
        <hlm-spinner class="text-[2rem]" />
      </div>
    } @else {
      <router-outlet />
    }
    <rbth-toaster position="bottom-center" />
  `,
})
export class AppComponent {
  #router = inject(Router);
  isNavigating = computed(() => !!this.#router.currentNavigation());

  constructor() {
    console.log(import.meta.env);
  }
}
