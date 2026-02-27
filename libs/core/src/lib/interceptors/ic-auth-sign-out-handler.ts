import { APP_INITIALIZER, inject, Provider } from '@angular/core';

import { AUTH_SERVICE } from '@rabbithole/auth';

import { IcFetchInterceptorService } from './ic-fetch.interceptor';

export function provideIcAuthSignOutHandler(): Provider {
  return {
    provide: APP_INITIALIZER,
    useFactory: () => {
      const interceptor = inject(IcFetchInterceptorService);
      const authService = inject(AUTH_SERVICE);
      return () => {
        interceptor.register({
          response: (response) => {
            if (response.status === 400 && authService.isAuthenticated()) {
              authService.signOut();
            }
          },
        });
        interceptor.init();
      };
    },
    multi: true,
  };
}
