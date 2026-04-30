import { Route } from '@angular/router';

export const storagesRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/storages/storages.component').then(
        (m) => m.StoragesComponent,
      ),
  },
];
