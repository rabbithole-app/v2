import { Route } from '@angular/router';

export const sharedWithMeRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/shared-with-me/shared-with-me.component').then(
        (m) => m.SharedWithMeComponent,
      ),
  },
];
