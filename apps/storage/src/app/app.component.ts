import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';

import { HlmToaster } from '@spartan-ng/helm/sonner';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

@Component({
  selector: 'app-root',
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [RouterOutlet, HlmToaster, HlmSpinner],
})
export class AppComponent {
  readonly #router = inject(Router);

  readonly isNavigating = computed(() => !!this.#router.currentNavigation());
}
