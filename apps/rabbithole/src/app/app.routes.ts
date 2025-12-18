import { Route } from '@angular/router';

import { storageViewGuard } from './core/guards';
import {
  createProfileGuard,
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
          import('./pages/storages/storages.component').then(
            (m) => m.StoragesComponent,
          ),
      },
      {
        path: '',
        loadComponent: () =>
          import('./core/components/main-navigation/main-navigation.component').then(
            (m) => m.MainNavigationComponent,
          ),
        outlet: 'sidebar-2',
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./pages/users/users.component').then((m) => m.UsersComponent),
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
      // Route :id with canMatch - will match only if id is a Principal
      {
        path: ':id',
        canMatch: [storageViewGuard],
        children: [
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
              import('./core/components/storage-navigation/storage-navigation.component').then(
                (m) => m.StorageNavigationComponent,
              ),
            outlet: 'sidebar-1',
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
  {
    path: 'create-profile',
    canActivate: [dashboardGuard, createProfileGuard],
    loadComponent: () =>
      import('@rabbithole/pages/create-profile').then(
        (m) => m.CreateProfileComponent,
      ),
  },
  { path: '**', pathMatch: 'full', redirectTo: '' },
];
