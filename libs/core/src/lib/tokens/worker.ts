import { InjectionToken } from '@angular/core';

export const WORKER = new InjectionToken<Worker | null>('WORKER');
export const WORKER_FACTORY = new InjectionToken<() => Worker | null>(
  'WORKER_FACTORY',
);
