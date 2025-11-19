import { Route } from '@angular/router';

import {
  createProfileGuard,
  dashboardGuard,
  loginGuard,
  storageViewGuard,
} from './core/guards';
import { canisterStatusResolver, profileResolver } from './core/resolvers';
import { DashboardComponent } from './pages/dashboard/dashboard.component';

export const appRoutes: Route[] = [
  {
    path: '',
    component: DashboardComponent,
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
          import('./widgets/main-navigation/main-navigation.component').then(
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
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./pages/canisters/canisters.component').then(
                (m) => m.CanistersComponent,
              ),
          },
          {
            path: ':id',
            loadComponent: () =>
              import('./pages/canister-detail/canister-detail.component').then(
                (m) => m.CanisterDetailComponent,
              ),
            resolve: {
              canisterStatus: canisterStatusResolver,
            },
          },
        ],
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./pages/profile/profile.component').then(
            (m) => m.ProfileComponent,
          ),
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
                loadComponent: () =>
                  import('./pages/storage-view/storage-view.component').then(
                    (m) => m.StorageViewComponent,
                  ),
              },
              {
                path: 'permissions',
                loadComponent: () =>
                  import('./pages/permissions/permissions.component').then(
                    (m) => m.PermissionsComponent,
                  ),
              },
            ],
          },
          {
            path: '',
            loadComponent: () =>
              import(
                './widgets/storage-navigation/storage-navigation.component'
              ).then((m) => m.StorageNavigationComponent),
            outlet: 'sidebar-1',
          },
        ],
      },
    ],
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.component').then((m) => m.LoginComponent),
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
      import('./pages/create-profile/create-profile.component').then(
        (m) => m.CreateProfileComponent,
      ),
  },
  { path: '**', pathMatch: 'full', redirectTo: '' },
];
