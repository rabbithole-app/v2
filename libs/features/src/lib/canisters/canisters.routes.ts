import { Route } from '@angular/router';

import { canisterListResolver, canisterStatusResolver } from './resolvers';

export const canistersRoutes: Route[] = [
  {
    path: '',
    resolve: {
      canisterList: canisterListResolver,
    },
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages').then((m) => m.CanistersComponent),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./pages').then((m) => m.CanisterDetailComponent),
        resolve: {
          canisterStatus: canisterStatusResolver,
        },
      },
    ],
  },
];
