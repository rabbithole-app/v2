import { Route } from '@angular/router';

export const releasesRoutes: Route[] = [
  {
    path: '',
    loadComponent: () => import('./pages').then((m) => m.ReleasesComponent),
  },
];
