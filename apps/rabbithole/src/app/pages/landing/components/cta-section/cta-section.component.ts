import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGithub } from '@ng-icons/lucide';

import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSeparator } from '@spartan-ng/helm/separator';

import { environment } from '../../../../../environments/environment';

@Component({
  selector: 'app-landing-cta',
  imports: [NgIcon, HlmSeparator, ...HlmButtonImports],
  providers: [provideIcons({ lucideGithub })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block px-6',
  },
  template: `
    <hlm-separator />
    <footer class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-6 sm:flex-row">
      <div class="flex items-center gap-2">
        <img src="/logo-rabbit.svg" alt="Rabbithole" class="h-5 w-5 opacity-50" />
        <span class="text-xs text-muted-foreground">&copy; {{ year }} Rabbithole</span>
      </div>
      <div class="flex items-center gap-1">
        <a hlmBtn variant="ghost" size="sm" [href]="docsUrl" target="_blank" rel="noopener">Docs</a>
        <a hlmBtn variant="ghost" size="sm" [href]="docsUrl + '/en/legal/privacy'" target="_blank" rel="noopener">Privacy</a>
        <a hlmBtn variant="ghost" size="sm" [href]="docsUrl + '/en/legal/terms'" target="_blank" rel="noopener">Terms</a>
        <a hlmBtn variant="ghost" size="icon-sm" href="https://github.com/rabbithole-app/v2" target="_blank" rel="noopener">
          <ng-icon name="lucideGithub" size="16" />
        </a>
        <a hlmBtn variant="ghost" size="sm" href="https://x.com/rabbithole_ic" target="_blank" rel="noopener">𝕏</a>
      </div>
    </footer>
  `,
})
export class CtaSectionComponent {
  protected readonly docsUrl = environment.docsUrl;
  readonly year = new Date().getFullYear();
}
