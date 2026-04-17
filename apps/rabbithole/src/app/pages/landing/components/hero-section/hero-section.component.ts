import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { AUTH_SERVICE } from '@rabbithole/auth';
import { RbthRainbowButton } from '@rabbithole/ui';
import { HlmButtonImports } from '@spartan-ng/helm/button';

@Component({
  selector: 'app-landing-hero',
  imports: [RouterLink, ...HlmButtonImports, RbthRainbowButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
  template: `

    <div class="relative z-10 mx-auto flex max-w-7xl flex-col items-center gap-8 px-6 py-16 lg:min-h-[calc(100dvh-3.5rem)] lg:flex-row lg:justify-center lg:gap-0 lg:py-0">
      <!-- Text -->
      <div class="flex-1 text-center lg:text-left">
        <p class="mb-3 text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground sm:text-sm">
          Encrypted file storage
        </p>
        <h1 class="text-[clamp(2.5rem,8vw,4.5rem)] font-black uppercase leading-[0.9] tracking-tight">
          Rabbithole
        </h1>
        <p class="mt-5 max-w-md text-lg text-muted-foreground max-lg:mx-auto">
          No passwords. No master keys.
          Your files are protected by mathematics, not promises.
        </p>
        <div class="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
          <a rbthRainbowBtn size="lg" [routerLink]="ctaLink()">{{ ctaText() }}</a>
          <a
            hlmBtn
            variant="outline"
            size="lg"
            href="https://docs.rabbithole.app"
            target="_blank"
            rel="noopener"
          >
            Read Docs
          </a>
        </div>
      </div>

      <!-- Canister -->
      <div class="flex-shrink-0 lg:-mr-12">
        <img
          src="/canister.png"
          alt="Your personal encrypted canister"
          class="h-auto w-[260px] sm:w-[380px] lg:w-[560px] xl:w-[680px]"
        />
      </div>
    </div>
  `,
})
export class HeroSectionComponent {
  readonly #authService = inject(AUTH_SERVICE);
  readonly ctaLink = computed(() =>
    this.#authService.isAuthenticated() ? '/dashboard' : '/login',
  );
  readonly ctaText = computed(() =>
    this.#authService.isAuthenticated() ? 'My Files' : 'Open App',
  );
}
