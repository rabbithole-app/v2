import { Route } from '@angular/router';

import {
  adminGuard,
  dashboardGuard,
  loginGuard,
  profileResolver,
} from '@rabbithole/core/app-runtime';

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
        path: 'pricing',
        loadComponent: () =>
          import('@rabbithole/pages/pricing').then(
            (m) => m.PricingComponent,
          ),
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
          import('@rabbithole/features/storages/routes').then(
            (m) => m.storagesRoutes,
          ),
      },
      {
        path: 'create-storage',
        outlet: 'dialog',
        loadComponent: () =>
          import('@rabbithole/features/storages/create-storage-trigger').then(
            (m) => m.CreateStorageTriggerComponent,
          ),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('@rabbithole/pages/profile').then((m) => m.ProfileComponent),
      },
      {
        path: 'subscription',
        loadComponent: () =>
          import('@rabbithole/pages/subscription').then(
            (m) => m.SubscriptionPageComponent,
          ),
      },
      {
        path: 'wallet',
        loadComponent: () =>
          import('@rabbithole/pages/wallet').then((m) => m.WalletPageComponent),
      },
      {
        path: 'demo',
        loadComponent: () =>
          import('./pages/demo/demo.component').then((m) => m.DemoComponent),
      },
      {
        path: 'admin',
        canActivate: [adminGuard],
        children: [
          {
            path: '',
            pathMatch: 'full',
            redirectTo: 'users',
          },
          {
            path: 'users',
            loadComponent: () =>
              import('./pages/admin/users/admin-users.component').then(
                (m) => m.AdminUsersComponent,
              ),
          },
        ],
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
  { path: 'demo', pathMatch: 'full', redirectTo: 'dashboard/demo' },
  { path: '**', pathMatch: 'full', redirectTo: 'dashboard' },
];
