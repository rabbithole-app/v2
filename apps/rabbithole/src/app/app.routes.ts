import { Route } from '@angular/router';

import { createProfileGuard, dashboardGuard, loginGuard } from './core/guards';
import { profileResolver } from './core/resolvers';
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
        path: 'users',
        loadComponent: () =>
          import('./pages/users/users.component').then((m) => m.UsersComponent),
      },
      {
        path: 'permissions',
        loadComponent: () =>
          import('./pages/permissions/permissions.component').then(
            (m) => m.PermissionsComponent,
          ),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./pages/profile/profile.component').then(
            (m) => m.ProfileComponent,
          ),
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
