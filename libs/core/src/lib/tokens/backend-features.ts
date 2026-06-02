import { InjectionToken } from '@angular/core';

export const BACKEND_FEATURES_ENABLED_TOKEN = new InjectionToken<boolean>(
  'BACKEND_FEATURES_ENABLED_TOKEN',
  {
    factory: () => true,
  },
);

export const ACCOUNT_MENU_BACKEND_LINKS_ENABLED_TOKEN = new InjectionToken<boolean>(
  'ACCOUNT_MENU_BACKEND_LINKS_ENABLED_TOKEN',
  {
    factory: () => true,
  },
);
