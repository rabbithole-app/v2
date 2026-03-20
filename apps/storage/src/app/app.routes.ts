import { Route } from '@angular/router';

import {
  dashboardGuard,
  loginGuard,
  profileResolver,
} from '@rabbithole/core';

export const appRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('@rabbithole/pages/dashboard').then((m) => m.DashboardComponent),
    canActivate: [dashboardGuard],
    resolve: {
      profile: profileResolver,
    },
    children: [
      {
        path: '',
        redirectTo: 'drive',
        pathMatch: 'full',
      },
      {
        path: '',
        loadComponent: () =>
          import('./app.component').then((m) => m.AppComponent),
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
      {
        path: '',
        loadComponent: () =>
          import(
            './core/components/update-banner/update-banner.component'
          ).then((m) => m.UpdateBannerComponent),
        outlet: 'banner',
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('@rabbithole/pages/profile').then((m) => m.ProfileComponent),
      },
    ],
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login-layout/login-layout.component').then(
        (m) => m.LoginLayoutComponent,
      ),
    canActivate: [loginGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('@rabbithole/pages/login').then((m) => m.LoginComponent),
      },
    ],
  },
  { path: '**', pathMatch: 'full', redirectTo: '' },
];
