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
    <router-outlet />
    <router-outlet name="dialog" />
    @if (isNavigating()) {
      <div
        class="bg-background fixed inset-0 z-50 flex items-center justify-center"
      >
        <hlm-spinner class="text-[2rem]" />
      </div>
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
