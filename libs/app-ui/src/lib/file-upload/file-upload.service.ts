import { computed, Injectable, signal } from '@angular/core';

import { FileWithPreview } from './file-upload.model';
import { injectFileUploadConfig } from './file-upload.token';
import { formatBytes } from './file-upload.utils';

type State = {
  errors: string[];
  files: FileWithPreview[];
};

const INITIAL_VALUE: State = {
  files: [],
  errors: [],
};

@Injectable()
export class FileUploadService {
  #state = signal(INITIAL_VALUE);
  readonly errors = computed(() => this.#state().errors);

  readonly files = computed(() => this.#state().files);
  #config = injectFileUploadConfig();

  addFiles(files: File[] | FileList) {
    const fileArray = Array.from(files);
    const currentFiles = this.#state().files;
    const errors: string[] = [];

    // Check file limit
    if (currentFiles.length + fileArray.length > this.#config.maxFiles) {
      errors.push(`Maximum ${this.#config.maxFiles} files allowed`);
      this.#state.update((prev) => ({ ...prev, errors }));
      return;
    }

    const validFiles: FileWithPreview[] = [];

    for (const file of fileArray) {
      // Check file size
      if (file.size > this.#config.maxSize) {
        errors.push(
          `${file.name} is too large. Maximum size is ${formatBytes(
            this.#config.maxSize,
          )}`,
        );
        continue;
      }

      const isDuplicate = currentFiles.some(
        (existingFile) =>
          existingFile.file.name === file.name &&
          existingFile.file.size === file.size,
      );

      if (isDuplicate) {
        errors.push(`${file.name} already exists`);
        continue;
      }

      const fileWithPreview: FileWithPreview = {
        file,
        id: crypto.randomUUID(),
        preview: file.type.startsWith('image/')
          ? URL.createObjectURL(file)
          : undefined,
      };

      validFiles.push(fileWithPreview);
    }

    this.#state.update((prev) => ({
      ...prev,
      files: [...prev.files, ...validFiles],
      errors,
    }));
  }

  clearErrors() {
    this.#state.update((prev) => ({ ...prev, errors: [] }));
  }

  clearFiles() {
    // Revoke URL objects to prevent memory leaks
    this.#state().files.forEach((file) => {
      if (file.preview && file.preview.startsWith('blob:')) {
        URL.revokeObjectURL(file.preview);
      }
    });

    this.#state.update((prev) => ({ ...prev, files: [], errors: [] }));
  }

  removeFile(id: string) {
    const fileToRemove = this.#state().files.find((file) => file.id === id);

    // Revoke URL object to prevent memory leaks
    if (fileToRemove?.preview && fileToRemove.preview.startsWith('blob:')) {
      URL.revokeObjectURL(fileToRemove.preview);
    }

    this.#state.update((prev) => ({
      ...prev,
      files: prev.files.filter((file) => file.id !== id),
    }));
  }

  setDragging(isDragging: boolean) {
    this.#state.update((prev) => ({ ...prev, isDragging }));
  }
}
