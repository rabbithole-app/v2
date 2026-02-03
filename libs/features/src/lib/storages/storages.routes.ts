import { Route } from '@angular/router';

export const storagesRoutes: Route[] = [
  {
    path: '',
    loadComponent: () => import('./pages').then((m) => m.StoragesComponent),
  },
];
