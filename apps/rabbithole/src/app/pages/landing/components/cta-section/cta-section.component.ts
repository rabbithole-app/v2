import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGithub, lucidePlus } from '@ng-icons/lucide';

import { AUTH_SERVICE } from '@rabbithole/auth';
import { RbthRainbowButton } from '@rabbithole/ui/rainbow-button';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSeparator } from '@spartan-ng/helm/separator';

@Component({
  selector: 'app-landing-cta',
  imports: [RouterLink, NgIcon, HlmSeparator, ...HlmButtonImports, RbthRainbowButton],
  providers: [provideIcons({ lucideGithub, lucidePlus })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block pt-24 px-6',
  },
  template: `
    <div class="mx-auto max-w-2xl text-center">
      <h2 class="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
        Own your storage
      </h2>
      <p class="mx-auto mb-2 max-w-md text-muted-foreground">
        Create your encrypted storage in under a minute.
      </p>
      <p class="mx-auto mb-8 text-sm text-muted-foreground/70">
        No email. No password. Ready in under a minute.
      </p>
      <div class="flex flex-col items-center gap-4 pointer-events-auto">
        <a
          rbthRainbowBtn
          size="lg"
          [routerLink]="ctaLink()"
          [queryParams]="ctaQueryParams()"
        >
          <ng-icon name="lucidePlus" size="18" />
          Create Storage
        </a>
        <a
          hlmBtn
          variant="link"
          href="https://docs.rabbithole.app"
          target="_blank"
          rel="noopener"
        >
          Learn more at docs.rabbithole.app →
        </a>
      </div>
    </div>

    <!-- Footer -->
    <hlm-separator class="mt-24" />
    <footer class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-6 sm:flex-row">
      <div class="flex items-center gap-2">
        <img src="/logo-rabbit.svg" alt="Rabbithole" class="h-5 w-5 opacity-50" />
        <span class="text-xs text-muted-foreground">&copy; {{ year }} Rabbithole</span>
      </div>
      <div class="flex items-center gap-1">
        <a hlmBtn variant="ghost" size="sm" href="https://docs.rabbithole.app" target="_blank" rel="noopener">Docs</a>
        <a hlmBtn variant="ghost" size="sm" href="https://docs.rabbithole.app/en/legal/privacy" target="_blank" rel="noopener">Privacy</a>
        <a hlmBtn variant="ghost" size="sm" href="https://docs.rabbithole.app/en/legal/terms" target="_blank" rel="noopener">Terms</a>
        <a hlmBtn variant="ghost" size="icon-sm" href="https://github.com/rabbithole-app/v2" target="_blank" rel="noopener">
          <ng-icon name="lucideGithub" size="16" />
        </a>
        <a hlmBtn variant="ghost" size="sm" href="https://x.com/rabbithole_ic" target="_blank" rel="noopener">𝕏</a>
      </div>
    </footer>
  `,
})
export class CtaSectionComponent {
  readonly #authService = inject(AUTH_SERVICE);
  readonly ctaLink = computed(() =>
    this.#authService.isAuthenticated()
      ? ['/dashboard', { outlets: { dialog: 'create-storage' } }]
      : ['/login'],
  );
  readonly ctaQueryParams = computed(() =>
    this.#authService.isAuthenticated()
      ? null
      : { redirectUrl: '/dashboard/(dialog:create-storage)' },
  );
  readonly year = new Date().getFullYear();
}
