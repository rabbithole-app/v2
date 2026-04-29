import { Route } from '@angular/router';

import {
  dashboardGuard,
  loginGuard,
} from '@rabbithole/core';

export const appRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('@rabbithole/pages/dashboard').then((m) => m.DashboardComponent),
    canActivate: [dashboardGuard],
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
