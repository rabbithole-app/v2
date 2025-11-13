import { Injectable } from '@angular/core';
import {
  directoryOpen,
  fileOpen,
  fileSave,
  FileWithDirectoryAndFileHandle,
  supported,
} from 'browser-fs-access';

/**
 * Represents a file system item - either a file or an empty directory.
 */
type FileSystemItem =
  | {
      file: File;
      kind: 'file';
      name: string;
      parentPath?: string;
    }
  | {
      kind: 'directory';
      name: string;
      parentPath?: string;
    };

/**
 * Service for interacting with the File System Access API.
 * Provides methods to open directories, files, and list directory contents.
 * Uses browser-fs-access library for cross-browser compatibility.
 */
@Injectable()
export class FileSystemAccessService {
  private readonly ignoreFileList = ['.DS_Store', 'Thumbs.db'];

  constructor() {
    if (supported) {
      console.log('Using the File System Access API.');
    } else {
      console.log('Using the fallback implementation.');
    }
  }

  /**
   * Opens a directory picker dialog.
   * @param args - Arguments passed to directoryOpen from browser-fs-access
   * @returns Promise resolving to an array of files/directories
   */
  directoryOpen(...args: Parameters<typeof directoryOpen>) {
    return directoryOpen(...args);
  }

  /**
   * Opens a file picker dialog.
   * @param args - Arguments passed to fileOpen from browser-fs-access
   * @returns Promise resolving to a file or array of files
   */
  fileOpen(...args: Parameters<typeof fileOpen>) {
    return fileOpen(...args);
  }

  /**
   * Opens a file save dialog.
   * @param args - Arguments passed to fileSave from browser-fs-access
   * @returns Promise resolving to a file handle or null
   */
  fileSave(...args: Parameters<typeof fileSave>) {
    return fileSave(...args);
  }

  /**
   * Lists all files and empty directories from the selected directory.
   * Returns a flat array of FileSystemItem objects.
   * Only empty directories (without files) are included in the result.
   *
   * @returns Promise resolving to a flat array of file system items
   */
  async list(): Promise<FileSystemItem[]> {
    // Use directoryOpen to get files from the selected directory.
    // The directoryHandle in returned files points to the selected directory.
    const files = await this.directoryOpen({
      recursive: false,
      startIn: 'downloads',
      id: 'rabbithole-directory',
    });

    // Extract the handle of the selected directory from the first file.
    // The directoryHandle points to the parent directory (selected by the user).
    const rootDirectoryHandle = this.#extractRootDirectoryHandle(files);

    // If we couldn't get the directory handle, return only the files.
    if (!rootDirectoryHandle) {
      return this.#processFilesOnly(files);
    }

    const items: FileSystemItem[] = [];

    // Recursively process the root directory contents.
    await this.#processDirectory(rootDirectoryHandle, undefined, items);

    return items;
  }

  /**
   * Extracts the root directory handle from the first file in the array.
   * @param files - Array of files returned by directoryOpen
   * @returns The root directory handle or null if not found
   */
  #extractRootDirectoryHandle(
    files: (File | FileWithDirectoryAndFileHandle)[],
  ): FileSystemDirectoryHandle | null {
    if (files.length === 0) {
      return null;
    }

    const firstFile = files[0];
    if (
      'directoryHandle' in firstFile &&
      firstFile.directoryHandle !== undefined &&
      firstFile.directoryHandle !== null
    ) {
      return firstFile.directoryHandle;
    }

    return null;
  }

  /**
   * Recursively processes a directory and collects all files and empty directories.
   * Only directories without files are added to the result.
   *
   * @param directoryHandle - Handle of the directory to process
   * @param parentPath - Path of the parent directory (undefined for root)
   * @param items - Array to collect the results
   */
  async #processDirectory(
    directoryHandle: FileSystemDirectoryHandle,
    parentPath: string | undefined,
    items: FileSystemItem[],
  ): Promise<void> {
    const currentPath = parentPath
      ? `${parentPath}/${directoryHandle.name}`
      : directoryHandle.name;
    let hasFiles = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const entry of (directoryHandle as any).values()) {
      if (this.ignoreFileList.includes(entry.name)) {
        continue;
      }

      if (entry.kind === 'file') {
        hasFiles = true;
        const file = await (entry as FileSystemFileHandle).getFile();
        items.push({
          file,
          kind: 'file',
          name: file.name,
          parentPath: currentPath,
        });
      } else if (entry.kind === 'directory') {
        const subDirHandle = entry as FileSystemDirectoryHandle;
        await this.#processDirectory(subDirHandle, currentPath, items);

        // Check if the subdirectory contains any files by examining already collected items.
        const hasFilesInSubDir = items.some(
          (item) =>
            item.kind === 'file' &&
            item.parentPath?.startsWith(`${currentPath}/${subDirHandle.name}`),
        );
        if (hasFilesInSubDir) {
          hasFiles = true;
        }
      }
    }

    // If the directory has no files, add it to the result.
    if (!hasFiles) {
      items.push({
        kind: 'directory',
        name: directoryHandle.name,
        parentPath,
      });
    }
  }

  /**
   * Processes files only when directory handle is not available.
   * @param files - Array of files to process
   * @returns Array of file system items (files only)
   */
  #processFilesOnly(
    files: (File | FileWithDirectoryAndFileHandle)[],
  ): FileSystemItem[] {
    const items: FileSystemItem[] = [];

    for (const file of files) {
      if (!this.ignoreFileList.includes(file.name)) {
        items.push({
          file,
          kind: 'file',
          name: file.name,
          parentPath: undefined,
        });
      }
    }

    return items;
  }
}
