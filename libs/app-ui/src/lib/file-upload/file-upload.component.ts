import { NgTemplateOutlet } from '@angular/common';
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleAlert,
  lucideFile,
  lucideFileArchive,
  lucideFileSpreadsheet,
  lucideFileText,
  lucideFileUp,
  lucideHeadphones,
  lucideImage,
  lucideTrash2,
  lucideUpload,
  lucideVideo,
  lucideX,
} from '@ng-icons/lucide';
import { hlm } from '@spartan-ng/brain/core';
import { HlmButtonDirective } from '@spartan-ng/ui-button-helm';
import { HlmIconDirective } from '@spartan-ng/ui-icon-helm';
import { cva } from 'class-variance-authority';
import { ClassValue } from 'clsx';

import { FileIconPipe } from './file-icon.pipe';
import { FileWithPreview } from './file-upload.model';
import { FileUploadService } from './file-upload.service';
import { injectFileUploadConfig } from './file-upload.token';
import { FormatBytesPipe } from './format-bytes.pipe';

export const dropzoneVariants = cva(
  'border-input hover:bg-accent/50 data-[dragging=true]:bg-accent/50 flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed p-4 transition-colors',
  {
    variants: {
      disabled: {
        false:
          'focus:outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        true: 'pointer-events-none opacity-50',
      },
    },
    defaultVariants: {
      disabled: false,
    },
  }
);

@Component({
  selector: 'rbth-file-upload',
  imports: [
    NgIcon,
    HlmButtonDirective,
    HlmIconDirective,
    FormatBytesPipe,
    FileIconPipe,
    NgTemplateOutlet,
  ],
  providers: [
    provideIcons({
      lucideCircleAlert,
      lucideFile,
      lucideFileArchive,
      lucideFileSpreadsheet,
      lucideFileText,
      lucideFileUp,
      lucideHeadphones,
      lucideImage,
      lucideVideo,
      lucideX,
      lucideTrash2,
      lucideUpload,
    }),
  ],
  templateUrl: './file-upload.component.html',
  host: {
    '[class]': 'computedClass()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RbthFileUploadComponent {
  disabled = input(false, { transform: booleanAttribute });
  fileUploadService = inject(FileUploadService);
  isDragging = signal(false);
  upload = output<FileWithPreview[]>();
  readonly userClass = input<ClassValue>('');
  protected readonly computedClass = computed(() =>
    hlm('flex flex-col gap-2', this.userClass())
  );
  protected config = injectFileUploadConfig();

  protected readonly dropzoneComputedClass = computed(() =>
    dropzoneVariants({ disabled: this.disabled() })
  );

  handleDragEnter(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  handleDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();

    if ((event.currentTarget as Node)?.contains(event.relatedTarget as Node)) {
      return;
    }

    this.isDragging.set(false);
  }

  handleDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  handleDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.fileUploadService.addFiles(files);
    }
  }

  handleUpload() {
    const files = this.fileUploadService.files();
    this.upload.emit(files);
    this.fileUploadService.clearFiles();
  }

  openFileDialog() {
    if (this.disabled()) return;
    this.fileUploadService.showOpenFilePicker();
  }
}
