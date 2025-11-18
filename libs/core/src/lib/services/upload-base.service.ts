import { Injectable, signal } from '@angular/core';

import {
  FileUploadWithStatus,
  UploadId,
  UploadServiceState,
  UploadState,
  UploadStatus,
} from '../types';

const INITIAL_VALUE: UploadServiceState = {
  overallProgress: 0,
  isProcessing: false,
  files: [],
};

const calculateOverallProgress = (files: FileUploadWithStatus[]) => {
  const { current, total } = files.reduce(
    (acc, value) => {
      let current = acc.current;
      let total = acc.total;
      switch (value.status) {
        case UploadState.CANCELED:
        case UploadState.FAILED:
        case UploadState.INITIALIZING:
        case UploadState.NOT_STARTED:
        case UploadState.REQUESTING_VETKD:
          total += value.file.size;
          break;
        case UploadState.COMPLETED:
          current += value.file.size;
          total += value.file.size;
          break;
        case UploadState.IN_PROGRESS:
          current += value.current;
          total += value.total;
          break;
      }

      return { current, total };
    },
    { current: 0, total: 0 },
  );

  return Math.round((current / total) * 100);
};

const isProcessingFn = (files: FileUploadWithStatus[]) =>
  files.some(
    ({ status }) =>
      ![
        UploadState.CANCELED,
        UploadState.COMPLETED,
        UploadState.FAILED,
      ].includes(status),
  );

@Injectable()
export class UploadBaseService {
  #state = signal(INITIAL_VALUE);
  state = this.#state.asReadonly();

  add(item: FileUploadWithStatus) {
    this.#state.update((prevState) => {
      const files = [...prevState.files, item];
      const overallProgress = calculateOverallProgress(files);
      return {
        ...prevState,
        isProcessing: true,
        overallProgress,
        files,
      };
    });
  }

  clear() {
    this.#state.set(INITIAL_VALUE);
  }

  remove(id: UploadId) {
    this.#state.update((prevState) => {
      const files = prevState.files.filter((item) => item.id !== id);
      const isProcessing = isProcessingFn(files);
      const overallProgress = calculateOverallProgress(files);
      return {
        ...prevState,
        overallProgress,
        isProcessing,
        files,
      };
    });
  }

  update(value: UploadStatus) {
    this.#state.update((prevState) => {
      const files = prevState.files.map((item) => {
        if (item.id === value.id) {
          return { ...item, ...value };
        }
        return item;
      });
      const isProcessing = isProcessingFn(files);
      const overallProgress = calculateOverallProgress(files);
      return {
        ...prevState,
        isProcessing,
        overallProgress,
        files,
      };
    });
  }
}
