import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGithub } from '@ng-icons/lucide';
import { HlmIcon } from '@spartan-ng/helm/icon';

@Component({
  selector: 'rbth-feat-canisters-frontend-upload-github-selection',
  imports: [NgIcon, HlmIcon],
  providers: [provideIcons({ lucideGithub })],
  template: `
    <div
      class="border-input flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed p-8 opacity-50"
    >
      <div
        class="bg-background mb-4 flex size-16 shrink-0 items-center justify-center rounded-full border"
        aria-hidden="true"
      >
        <ng-icon hlm class="opacity-60" size="lg" name="lucideGithub" />
      </div>
      <p class="mb-2 text-base font-medium">GitHub releases</p>
      <p class="text-muted-foreground mb-4 text-center text-sm">
        Select a release from GitHub repository
      </p>
      <p class="text-muted-foreground text-xs">Coming soon</p>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FrontendUploadGithubSelectionComponent {}
