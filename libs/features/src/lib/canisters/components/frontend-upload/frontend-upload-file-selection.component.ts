import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideFileArchive, lucideUpload } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmIcon } from '@spartan-ng/helm/icon';

@Component({
  selector: 'rbth-feat-canisters-frontend-upload-file-selection',
  imports: [HlmEmptyImports, HlmButtonImports, NgIcon, HlmIcon],
  providers: [provideIcons({ lucideFileArchive, lucideUpload })],
  template: `
    <div
      hlmEmpty
      class="border-input hover:bg-accent/50 flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed p-8 transition-colors"
      (dragover)="onDragOver($event)"
      (drop)="onDrop($event)"
      role="button"
      tabindex="0"
    >
      <div hlmEmptyHeader>
        <div hlmEmptyMedia variant="icon">
          <ng-icon [svg]="fileArchiveIcon" />
        </div>
        <div hlmEmptyTitle>Select zip archive</div>
        <div hlmEmptyDescription>
          Select a frontend archive to upload to user canister
        </div>
      </div>
      <div hlmEmptyContent>
        <div class="flex gap-2">
          <button hlmBtn (click)="fileSelect.emit()">
            <ng-icon hlm size="sm" name="lucideUpload" />
            Select file
          </button>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FrontendUploadFileSelectionComponent {
  readonly fileArchiveIcon = lucideFileArchive;
  readonly fileDrop = output<File>();
  readonly fileSelect = output<void>();

  onDragOver(event: DragEvent) {
    event.preventDefault();
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer?.files[0];
    if (file) {
      this.fileDrop.emit(file);
    }
  }
}
