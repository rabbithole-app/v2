import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLayoutDashboard, lucideLogIn } from '@ng-icons/lucide';
import { filter, map, startWith } from 'rxjs';

import { AUTH_SERVICE } from '@rabbithole/auth';
import { RbthAuthNavbar } from '@rabbithole/ui/auth-navbar';
import { HlmButtonImports } from '@spartan-ng/helm/button';

@Component({
  selector: 'app-landing-navbar',
  imports: [NgIcon, RouterLink, RbthAuthNavbar, ...HlmButtonImports],
  providers: [provideIcons({ lucideLayoutDashboard, lucideLogIn })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <rbth-auth-navbar>
      @if (showCta()) {
        <ng-template #cta>
          <a hlmBtn variant="default" size="sm" [routerLink]="ctaLink()">
            <ng-icon [name]="ctaIcon()" size="16" />
            {{ ctaText() }}
          </a>
        </ng-template>
      }
    </rbth-auth-navbar>
  `,
})
export class LandingNavbarComponent {
  readonly #authService = inject(AUTH_SERVICE);
  readonly ctaIcon = computed(() =>
    this.#authService.isAuthenticated() ? 'lucideLayoutDashboard' : 'lucideLogIn',
  );
  readonly ctaLink = computed(() =>
    this.#authService.isAuthenticated() ? '/dashboard' : '/login',
  );
  readonly ctaText = computed(() =>
    this.#authService.isAuthenticated() ? 'Dashboard' : 'Open App',
  );
  readonly #router = inject(Router);
  readonly #currentUrl = toSignal(
    this.#router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.#router.url),
    ),
    { initialValue: this.#router.url },
  );
  readonly showCta = computed(() => {
    const url = this.#currentUrl();
    return !url.startsWith('/login') && !url.startsWith('/delegation');
  });
}
