import { Route } from '@angular/router';

import { accessRequestsCanActivate } from '@rabbithole/core/storage-runtime';

import {
  accessRequestsResolver,
  accessRequestTreeResolver,
} from './access-requests.resolvers';
import { AccessRequestDetailComponent } from './components/access-requests/access-request-detail.component';
import { AccessRequestsEmptyComponent } from './components/access-requests/access-requests-empty.component';
import { AccessRequestsShellComponent } from './components/access-requests/access-requests-shell.component';

export const accessRequestsRoutes: Route[] = [
  {
    path: '',
    canActivate: [accessRequestsCanActivate],
    resolve: {
      accessRequests: accessRequestsResolver,
    },
    component: AccessRequestsShellComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        component: AccessRequestsEmptyComponent,
      },
      {
        path: ':requestId',
        resolve: {
          accessRequestTree: accessRequestTreeResolver,
        },
        component: AccessRequestDetailComponent,
      },
    ],
  },
];
