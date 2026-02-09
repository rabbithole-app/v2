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
  lucideX,
} from '@ng-icons/lucide';

import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { HlmIcon } from '@spartan-ng/helm/icon';

import { UpdateCheckService } from '../../services';
import { UpgradeDialogComponent } from '../upgrade-dialog/upgrade-dialog.component';

@Component({
  selector: 'app-update-banner',
  imports: [NgIcon, HlmIcon, ...HlmButtonImports],
  providers: [
    provideIcons({
      lucideCircleAlert,
      lucideDownload,
      lucideX,
    }),
  ],
  template: `
    @if (updateCheckService.hasUpdate() && !dismissed()) {
      <div class="bg-muted border-b px-4 py-3 relative">
        <div class="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          <ng-icon hlmIcon name="lucideCircleAlert" size="sm" class="text-amber-500" />
          <span class="text-sm">
            @if (updateCheckService.availableReleaseTag(); as tag) {
              Version {{ tag }} available
            } @else {
              Update available
            }
            <span class="text-muted-foreground mx-1">&middot;</span>
            {{ updateCheckService.updateSummary() }}
          </span>
          <button hlmBtn variant="outline" size="sm" (click)="openUpgradeDialog()">
            <ng-icon hlmIcon name="lucideDownload" size="xs" />
            Update now
          </button>
        </div>
        <button hlmBtn variant="ghost" size="icon-sm" class="absolute right-2 top-1/2 -translate-y-1/2" (click)="dismiss()">
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
    const ref = this.#dialogService.open(UpgradeDialogComponent, {
      contentClass: 'min-w-[420px] sm:max-w-[500px] [&>[data-slot=dialog-close]]:hidden',
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
