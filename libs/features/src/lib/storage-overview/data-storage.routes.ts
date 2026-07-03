import { Route } from '@angular/router';

export const dataStorageRoutes: Route[] = [
  {
    path: '',
    data: {
      header: {
        title: 'Data storage',
      },
    },
    loadComponent: () =>
      import('./pages/data-storage/data-storage.component').then(
        (m) => m.DataStorageComponent,
      ),
  },
];
