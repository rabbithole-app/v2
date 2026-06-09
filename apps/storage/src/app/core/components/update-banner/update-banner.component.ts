import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleAlert,
  lucideDownload,
  lucideTriangleAlert,
  lucideX,
} from '@ng-icons/lucide';

import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { HlmHoverCardImports } from '@spartan-ng/helm/hover-card';
import { HlmIcon } from '@spartan-ng/helm/icon';

import { UpdateCheckService } from '../../services';
import { UpgradeDialogComponent } from '../upgrade-dialog/upgrade-dialog.component';

@Component({
  selector: 'app-update-banner',
  imports: [NgIcon, HlmIcon, ...HlmButtonImports, ...HlmHoverCardImports],
  providers: [
    provideIcons({
      lucideCircleAlert,
      lucideDownload,
      lucideTriangleAlert,
      lucideX,
    }),
  ],
  template: `
    @if (updateCheckService.hasUpdate() && !dismissed()) {
      <div class="relative border-b bg-muted px-4 py-3">
        <div class="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          <ng-icon
            hlmIcon
            name="lucideCircleAlert"
            size="sm"
            class="text-amber-500"
          />
          <span class="text-sm">
            @if (updateCheckService.availableReleaseTag(); as tag) {
              Version {{ tag }} available
            } @else {
              Update available
            }
            <span class="mx-1 text-muted-foreground">&middot;</span>
            {{ updateCheckService.updateSummary() }}
          </span>
          <button
            hlmBtn
            variant="outline"
            size="sm"
            (click)="openUpgradeDialog()"
          >
            <ng-icon hlmIcon name="lucideDownload" size="xs" />
            Update now
          </button>
        </div>
        <button
          hlmBtn
          variant="ghost"
          size="icon-sm"
          class="absolute top-1/2 right-2 -translate-y-1/2"
          (click)="dismiss()"
        >
          <ng-icon hlmIcon name="lucideX" size="sm" />
        </button>
      </div>
    } @else if (updateCheckService.hasBlockedUpdate() && !dismissed()) {
      <div class="relative border-b bg-muted px-4 py-3">
        <div class="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          <hlm-hover-card>
            <button
              hlmBtn
              hlmHoverCardTrigger
              variant="ghost"
              size="icon-sm"
              class="text-amber-600 hover:text-amber-700"
              aria-label="New release is not compatible with this storage"
            >
              <ng-icon hlmIcon name="lucideTriangleAlert" size="sm" />
            </button>
            <hlm-hover-card-content
              *hlmHoverCardPortal
              class="w-80 max-w-[calc(100vw-2rem)] space-y-2"
            >
              <h4 class="text-sm font-medium">Update is not compatible</h4>
              @if (updateCheckService.blockedReleaseOption(); as option) {
                <p class="text-sm text-muted-foreground">
                  Release
                  <span class="font-mono text-foreground">{{
                    option.tagName
                  }}</span>
                  cannot be installed from
                  <span class="font-mono text-foreground">
                    {{
                      updateCheckService.currentReleaseTag() ?? 'this version'
                    }} </span
                  >.
                </p>
                @if (option.disabledReason; as reason) {
                  <p class="text-xs text-muted-foreground">{{ reason }}</p>
                }
              }
            </hlm-hover-card-content>
          </hlm-hover-card>
          <span class="text-sm">
            A newer storage release is available, but it cannot be installed
            from your current version.
          </span>
        </div>
        <button
          hlmBtn
          variant="ghost"
          size="icon-sm"
          class="absolute top-1/2 right-2 -translate-y-1/2"
          (click)="dismiss()"
        >
          <ng-icon hlmIcon name="lucideX" size="sm" />
        </button>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateBannerComponent {
  readonly dismissed = signal(false);
  readonly updateCheckService = inject(UpdateCheckService);
  readonly #dialogService = inject(HlmDialogService);

  dismiss(): void {
    this.dismissed.set(true);
  }

  openUpgradeDialog(): void {
    if (!this.updateCheckService.hasUpdate()) return;

    const ref = this.#dialogService.open(UpgradeDialogComponent, {
      contentClass:
        'min-w-[420px] sm:max-w-[500px] [&>[data-slot=dialog-close]]:hidden',
      closeOnBackdropClick: false,
      closeOnOutsidePointerEvents: false,
      disableClose: true,
      role: 'alertdialog',
    });
    ref.closed$.subscribe(() => {
      this.updateCheckService.reset();
    });
  }
}
