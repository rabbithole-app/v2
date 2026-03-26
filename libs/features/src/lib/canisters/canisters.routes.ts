import { Route } from '@angular/router';

import { canisterListResolver, canisterStatusResolver } from './resolvers';

/** Routes for /dashboard/:id/canister — canister detail within a storage context. */
export const canisterDetailRoutes: Route[] = [
  {
    path: '',
    resolve: {
      canisterList: canisterListResolver,
      canisterStatus: canisterStatusResolver,
    },
    loadComponent: () =>
      import('./pages').then((m) => m.CanisterDetailComponent),
  },
];
