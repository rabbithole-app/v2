import { InjectionToken } from '@angular/core';

export const BACKEND_FEATURES_ENABLED_TOKEN = new InjectionToken<boolean>(
  'BACKEND_FEATURES_ENABLED_TOKEN',
  {
    factory: () => true,
  },
);
