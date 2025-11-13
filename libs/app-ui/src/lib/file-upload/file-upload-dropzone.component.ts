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
import { lucideFileUp } from '@ng-icons/lucide';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { cva } from 'class-variance-authority';
import { ClassValue } from 'clsx';
import { match, P } from 'ts-pattern';

import { injectFileUploadConfig } from './file-upload.token';
import { FormatBytesPipe } from './format-bytes.pipe';
import { FileSystemAccessService } from '@rabbithole/core';

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
  },
);

@Component({
  selector: 'rbth-file-upload-dropzone',
  imports: [NgIcon, HlmIcon, FormatBytesPipe, NgTemplateOutlet],
  providers: [provideIcons({ lucideFileUp })],
  templateUrl: './file-upload-dropzone.component.html',
  host: {
    class: 'contents',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RbthFileUploadDropzoneComponent {
  added = output<File[] | FileList>();
  disabled = input(false, { transform: booleanAttribute });
  isDragging = signal(false);
  readonly userClass = input<ClassValue>('', { alias: 'class' });
  protected config = injectFileUploadConfig();
  protected readonly dropzoneComputedClass = computed(() =>
    dropzoneVariants({ disabled: this.disabled() }),
  );
  // TODO: replace to token which provides another service for Tauri v2
  #fsAccessService = inject(FileSystemAccessService);

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
      this.added.emit(files);
    }
  }

  async openFileDialog() {
    if (this.disabled()) return;
    const fileHandles = await this.#fsAccessService.fileOpen({
      multiple: this.config.multiple,
    });
    const files = await Promise.all(
      match(fileHandles)
        .with(P.array({ handle: P.nonNullable.select() }), (v) =>
          v.map((f) => f.getFile()),
        )
        .with({ handle: P.nonNullable.select() }, (f) => [f.getFile()])
        .run(),
    );
    this.added.emit(files);
  }
}
