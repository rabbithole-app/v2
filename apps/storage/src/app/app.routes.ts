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
      import('@rabbithole/pages/login').then((m) => m.LoginComponent),
    canActivate: [loginGuard],
  },
  { path: '**', pathMatch: 'full', redirectTo: '' },
];
