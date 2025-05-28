import { computed, Injectable, signal } from '@angular/core';
import {
  type FileSystemDirectoryHandle,
  type FileSystemFileHandle,
  showDirectoryPicker,
  showOpenFilePicker,
} from 'native-file-system-adapter';

import { FileMetadata, FileWithPreview } from './file-upload.model';
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

  private readonly ignoreFileList = ['.DS_Store', 'Thumbs.db'];

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
            this.#config.maxSize
          )}`
        );
        continue;
      }

      const isDuplicate = currentFiles.some(
        (existingFile) =>
          existingFile.file.name === file.name &&
          existingFile.file.size === file.size
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

  setInitialFiles(initialFiles: FileMetadata[]) {
    const files = initialFiles.map((file) => ({
      file,
      id: file.id,
      preview: file.url,
    }));

    this.#state.update((prev) => ({ ...prev, files }));
  }

  // Methods for working with File System Access API
  async showDirectoryPicker() {
    try {
      const dirHandle = await showDirectoryPicker();
      const [files] = await this.listFilesAndDirsRecursively(dirHandle);

      const fileObjects = files.map(({ file }) => file);
      this.addFiles(fileObjects);
    } catch (err) {
      console.error('Directory picker error:', err);
    }
  }

  async showOpenFilePicker() {
    try {
      const fileHandles = await showOpenFilePicker({
        multiple: this.#config.multiple,
      });

      const files = await Promise.all(
        fileHandles.map((handle) => handle.getFile())
      );

      this.addFiles(files);
    } catch (err) {
      console.error('File picker error:', err);
    }
  }

  private async listFilesAndDirsRecursively(
    dirHandle: FileSystemDirectoryHandle,
    cwd?: string
  ): Promise<[{ file: File; path: string }[], string[]]> {
    const path = cwd ? `${cwd}/${dirHandle.name}` : dirHandle.name;
    const files: Array<{ file: File; path: string }> = [];
    const directories: string[] = [path];

    for await (const [name, handle] of dirHandle.entries()) {
      if (this.ignoreFileList.includes(name)) continue;

      if (handle.kind === 'directory') {
        const [f, d] = await this.listFilesAndDirsRecursively(
          handle as FileSystemDirectoryHandle,
          path
        );
        files.push(...f);
        directories.push(...d);
      } else {
        files.push({
          file: await (handle as FileSystemFileHandle).getFile(),
          path,
        });
      }
    }

    return [files, directories];
  }
}
