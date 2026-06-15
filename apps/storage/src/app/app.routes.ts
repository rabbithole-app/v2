import { Route } from '@angular/router';

import {
  dashboardGuard,
  loginGuard,
} from '@rabbithole/core/app-runtime';

export const appRoutes: Route[] = [
  {
    path: '',
    data: {
      header: {
        title: 'Storage',
      },
    },
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
        path: 'drive',
        loadChildren: () =>
          import('@rabbithole/features/file-list').then(
            (m) => m.fileListRoutes,
          ),
      },
      {
        path: 'access-requests',
        loadChildren: () =>
          import('@rabbithole/features/file-list').then(
            (m) => m.accessRequestsRoutes,
          ),
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
            './core/components/storage-metrics-footer/storage-metrics-footer.component'
          ).then((m) => m.StorageMetricsFooterComponent),
        outlet: 'sidebarBottom',
      },
      {
        path: '',
        loadComponent: () =>
          import('@rabbithole/core/storage-version-info').then(
            (m) => m.StorageVersionInfoComponent,
          ),
        outlet: 'header',
      },
      {
        path: '',
        loadComponent: () =>
          import(
            './core/components/update-banner/update-banner.component'
          ).then((m) => m.UpdateBannerComponent),
        outlet: 'banner',
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
