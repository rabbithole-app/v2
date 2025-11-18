import { Component, computed, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

import { RbthToaster } from '@rabbithole/ui';

@Component({
  imports: [RouterModule, RbthToaster, HlmSpinner],
  selector: 'app-root',
  template: `
    @if (isNavigating()) {
      <div class="flex items-center h-dvh w-full justify-center">
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
