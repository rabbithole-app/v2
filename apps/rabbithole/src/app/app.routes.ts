import { Route } from '@angular/router';

import { dashboardGuard, loginGuard, profileResolver } from '@rabbithole/core';

import { storageViewGuard } from './core/guards';

export const appRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/dashboard/dashboard.component').then(
        (m) => m.DashboardComponent,
      ),
    canActivate: [dashboardGuard],
    resolve: {
      profile: profileResolver,
    },
    children: [
      {
        path: '',
        loadChildren: () =>
          import('@rabbithole/features/storages').then(
            (m) => m.storagesRoutes,
          ),
      },

      {
        path: 'users',
        loadComponent: () =>
          import('./pages/users/users.component').then((m) => m.UsersComponent),
      },
      {
        path: 'releases',
        loadChildren: () =>
          import('@rabbithole/features/releases').then(
            (m) => m.releasesRoutes,
          ),
      },
      {
        path: 'canisters',
        loadChildren: () =>
          import('@rabbithole/features/canisters').then(
            (m) => m.canistersRoutes,
          ),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('@rabbithole/pages/profile').then((m) => m.ProfileComponent),
      },
      {
        path: 'allowances',
        loadChildren: () =>
          import('@rabbithole/features/allowances').then(
            (m) => m.allowancesRoutes,
          ),
      },
      // Route :id with canMatch - will match only if id is a Principal
      {
        path: ':id',
        canMatch: [storageViewGuard],
        children: [
          {
            path: '',
            redirectTo: 'drive',
            pathMatch: 'full',
          },
          {
            path: '',
            loadComponent: () =>
              import('./pages/storage/storage.component').then(
                (m) => m.StorageComponent,
              ),
            children: [
              {
                path: 'drive',
                loadChildren: () =>
                  import('@rabbithole/features/file-list').then(
                    (m) => m.fileListRoutes,
                  ),
              },
              {
                path: 'permissions',
                loadComponent: () =>
                  import('@rabbithole/pages/permissions').then(
                    (m) => m.PermissionsComponent,
                  ),
              },
            ],
          },
          {
            path: '',
            loadComponent: () =>
              import(
                './core/components/storage-navigation/storage-navigation.component'
              ).then((m) => m.StorageNavigationComponent),
            outlet: 'sidebar',
          },
        ],
      },
    ],
  },
  {
    path: 'login',
    loadComponent: () =>
      import('@rabbithole/pages/login').then((m) => m.LoginComponent),
    canActivate: [loginGuard],
  },
  {
    path: 'delegation',
    loadComponent: () =>
      import('./pages/delegation/delegation.component').then(
        (m) => m.DelegationComponent,
      ),
  },
  { path: '**', pathMatch: 'full', redirectTo: '' },
];
