import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBookOpen, lucideMegaphone } from '@ng-icons/lucide';

import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';

import { environment } from '../../../../../environments/environment';

@Component({
  selector: 'app-landing-ambassador',
  imports: [NgIcon, HlmIcon, RouterLink, HlmBadge, ...HlmButtonImports],
  providers: [provideIcons({ lucideBookOpen, lucideMegaphone })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
  template: `
    <section id="ambassador" class="scroll-mt-24 px-4 py-16">
      <div
        class="mx-auto flex max-w-5xl flex-col items-center gap-6 px-6 py-10 text-center"
      >
        <span hlmBadge variant="secondary">Ambassador Program</span>
        <h2 class="text-3xl font-bold tracking-tight sm:text-4xl">
          <span class="block">Recommend Rabbithole.</span>
          <span class="block">Earn on every payment.</span>
        </h2>
        <p class="max-w-2xl text-balance text-muted-foreground">
          Share your link and earn a recurring share of every payment made by
          the people you bring — withdrawable from your wallet anytime.
        </p>
        <div class="flex flex-wrap items-center justify-center gap-3">
          <a hlmBtn routerLink="/dashboard/ambassador">
            <ng-icon hlmIcon size="sm" name="lucideMegaphone" />
            Become an ambassador
          </a>
          <a
            hlmBtn
            variant="outline"
            [href]="docsUrl + '/en/ambassador-program'"
            target="_blank"
            rel="noopener"
          >
            <ng-icon hlmIcon size="sm" name="lucideBookOpen" />
            Program details
          </a>
        </div>
      </div>
    </section>
  `,
})
export class AmbassadorSectionComponent {
  protected readonly docsUrl = environment.docsUrl;
}
