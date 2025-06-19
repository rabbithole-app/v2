import { InjectionToken } from '@angular/core';

export const WORKER = new InjectionToken<Worker | null>('WORKER');
