import { Signal } from '@angular/core';

import { UploadId, UploadStatus } from './worker';

export type FileUploadWithStatus = {
  file: File;
  path?: string;
  preview?: string;
} & UploadStatus;

export interface IUploadService {
  add(item: { file: File; path?: string }): Promise<void>;
  cancel(id: UploadId): void;
  clear(): void;
  hasPermission: Signal<boolean>;
  remove(id: UploadId): void;
  retry(id: UploadId): void;
  state: Signal<UploadServiceState>;
}

export type UploadServiceState = {
  files: FileUploadWithStatus[];
  isProcessing: boolean;
  overallProgress: number;
};
