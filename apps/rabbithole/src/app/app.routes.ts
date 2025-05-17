import { Route } from '@angular/router';

import { dashboardGuard, loginGuard } from './core/guards';
import { DashboardComponent } from './pages/dashboard/dashboard.component';

export const appRoutes: Route[] = [
  {
    path: '',
    component: DashboardComponent,
    pathMatch: 'full',
    canActivate: [dashboardGuard],
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
        (m) => m.DelegationComponent
      ),
  },
  { path: '**', pathMatch: 'full', redirectTo: '' },
];
