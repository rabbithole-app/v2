import { inject, InjectionToken, ValueProvider } from '@angular/core';

export type FileUploadConfig = {
  accept: string;
  maxFiles: number;
  maxSize: number;
  multiple: boolean;
};

const defaultConfig: FileUploadConfig = {
  accept: '*',
  maxFiles: 10,
  maxSize: 100 * 1024 * 1024, // 100MB,
  multiple: true,
};

export const FILE_UPLOAD_CONFIG = new InjectionToken<FileUploadConfig>(
  'FILE_UPLOAD_CONFIG'
);

export function injectFileUploadConfig(): FileUploadConfig {
  return inject(FILE_UPLOAD_CONFIG, { optional: true }) ?? defaultConfig;
}

export function provideFileUploadConfig(
  config: Partial<FileUploadConfig>
): ValueProvider {
  return {
    provide: FILE_UPLOAD_CONFIG,
    useValue: { ...defaultConfig, ...config },
  };
}
