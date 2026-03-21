import { Route } from '@angular/router';

import { dashboardGuard, loginGuard, profileResolver } from '@rabbithole/core';

import { storageViewGuard } from './core/guards';

export const appRoutes: Route[] = [
  // Landing layout group (particles + navbar)
  {
    path: '',
    loadComponent: () =>
      import('./pages/landing/landing-layout.component').then(
        (m) => m.LandingLayoutComponent,
      ),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./pages/landing/landing.component').then(
            (m) => m.LandingComponent,
          ),
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
    ],
  },
  // Dashboard layout group
  {
    path: 'dashboard',
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
        path: 'create-storage',
        outlet: 'dialog',
        loadComponent: () =>
          import('@rabbithole/features/storages').then(
            (m) => m.CreateStorageTriggerComponent,
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
                path: 'canister',
                loadChildren: () =>
                  import('@rabbithole/features/canisters').then(
                    (m) => m.canisterDetailRoutes,
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
    path: 'ii-bridge',
    loadComponent: () =>
      import('./pages/ii-bridge/ii-bridge.component').then(
        (m) => m.IiBridgeComponent,
      ),
  },
  { path: '**', pathMatch: 'full', redirectTo: 'dashboard' },
];
