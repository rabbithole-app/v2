import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { BrnProgress } from '@spartan-ng/brain/progress';
import { HlmProgressImports } from '@spartan-ng/helm/progress';

@Component({
  selector: 'rbth-feat-canisters-frontend-upload-progress',
  imports: [...HlmProgressImports, BrnProgress, DecimalPipe],
  template: `
    <div class="space-y-2 px-4">
      <div class="flex items-center justify-between text-sm">
        <span class="font-medium"> Uploading files... </span>
        <span class="text-muted-foreground">
          {{ completedFiles() }} / {{ totalFiles() }} files
        </span>
      </div>
      <div hlmProgress [value]="overallProgress()" class="h-2">
        <hlm-progress-indicator />
      </div>
      <p class="text-muted-foreground text-xs">
        {{ overallProgress() | number: '1.0-0' }}% completed
      </p>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FrontendUploadProgressComponent {
  readonly completedFiles = input.required<number>();
  readonly overallProgress = input.required<number>();
  readonly totalFiles = input.required<number>();
}
