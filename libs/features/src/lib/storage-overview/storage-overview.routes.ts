import { Route } from '@angular/router';

export const storageOverviewRoutes: Route[] = [
  {
    path: '',
    data: {
      header: {
        title: 'Storage overview',
      },
    },
    loadComponent: () =>
      import('./pages/storage-overview/storage-overview.component').then(
        (m) => m.StorageOverviewComponent,
      ),
  },
];
