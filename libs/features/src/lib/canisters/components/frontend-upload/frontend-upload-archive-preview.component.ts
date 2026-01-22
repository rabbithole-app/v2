import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideFileArchive, lucideX } from '@ng-icons/lucide';

import { FormatBytesPipe } from '@rabbithole/core';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';

@Component({
  selector: 'rbth-feat-canisters-frontend-upload-archive-preview',
  imports: [...HlmButtonImports, NgIcon, HlmIcon, FormatBytesPipe],
  providers: [provideIcons({ lucideFileArchive, lucideX })],
  template: `
    <div class="mx-4 bg-muted/50 flex items-center gap-3 rounded-lg border p-4">
      <div
        class="flex aspect-square size-12 shrink-0 items-center justify-center rounded border"
      >
        <ng-icon hlm class="opacity-60 size-6" [svg]="fileArchiveIcon" />
      </div>
      <div class="flex-1 min-w-0">
        <p class="truncate text-sm font-medium">{{ archive().name }}</p>
        <p class="text-muted-foreground text-xs">
          {{ archive().size | formatBytes }}
        </p>
      </div>
      @if (showCancel()) {
        <button
          hlmBtn
          variant="ghost"
          size="icon-sm"
          (click)="archiveCanceled.emit()"
        >
          <ng-icon hlm size="sm" name="lucideX" />
        </button>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FrontendUploadArchivePreviewComponent {
  readonly archive = input.required<File>();
  readonly archiveCanceled = output<void>();
  readonly fileArchiveIcon = lucideFileArchive;
  readonly showCancel = input<boolean>(true);
}
