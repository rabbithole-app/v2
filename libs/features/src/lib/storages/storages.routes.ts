import { Route } from '@angular/router';

export const storagesRoutes: Route[] = [
  {
    path: '',
    data: {
      header: {
        title: 'Storages',
      },
    },
    loadComponent: () =>
      import('./pages/storages/storages.component').then(
        (m) => m.StoragesComponent,
      ),
  },
];
