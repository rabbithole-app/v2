import { InjectionToken } from '@angular/core';

export const MAIN_BACKEND_URL_TOKEN = new InjectionToken<string>(
  'MAIN_BACKEND_URL_TOKEN',
);

export const APP_NAME_TOKEN = new InjectionToken<string>('APP_NAME_TOKEN');

export const IS_PRODUCTION_TOKEN = new InjectionToken<boolean>(
  'IS_PRODUCTION_TOKEN',
);
