import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleAlert,
  lucideExternalLink,
  lucideX,
} from '@ng-icons/lucide';

import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';

import { UpdateCheckService } from '../../services';

@Component({
  selector: 'app-update-banner',
  imports: [NgIcon, HlmIcon, ...HlmButtonImports],
  providers: [
    provideIcons({
      lucideCircleAlert,
      lucideExternalLink,
      lucideX,
    }),
  ],
  template: `
    @if (updateCheckService.hasUpdate() && !dismissed()) {
      <div class="bg-muted border-b px-4 py-3">
        <div class="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          <ng-icon hlmIcon name="lucideCircleAlert" size="sm" class="text-amber-500" />
          <span class="text-sm">
            Update available
            <span class="text-muted-foreground mx-1">&middot;</span>
            A {{ updateCheckService.updateSummary() }} update is available
          </span>
          <a
            hlmBtn
            variant="outline"
            size="sm"
            [href]="updateCheckService.rabbitholeUrl"
            target="_blank"
          >
            Open Rabbithole
            <ng-icon hlmIcon name="lucideExternalLink" size="xs" />
          </a>
          <button hlmBtn variant="ghost" size="icon-sm" (click)="dismiss()">
            <ng-icon hlmIcon name="lucideX" size="sm" />
          </button>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateBannerComponent {
  readonly dismissed = signal(false);
  readonly updateCheckService = inject(UpdateCheckService);

  dismiss(): void {
    this.dismissed.set(true);
  }
}
