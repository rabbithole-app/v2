import { UploadStatus } from './worker';

export type FileUploadWithStatus = {
  file: File;
  path?: string;
  preview?: string;
} & UploadStatus;
