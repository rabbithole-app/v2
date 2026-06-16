import { EnvironmentInjector, inject, runInInjectionContext } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  Route,
  RouterStateSnapshot,
} from '@angular/router';

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
        data: {
          header: {
            title: 'Profile',
          },
        },
        loadComponent: () =>
          import('@rabbithole/pages/profile').then((m) => m.ProfileComponent),
      },
      {
        path: 'wallet',
        data: {
          header: {
            title: 'Wallet',
            subtitle: 'Balances across supported networks.',
          },
        },
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
            data: {
              header: {
                title: 'Admin overview',
                subtitle: 'Treasury funding and backend runtime health.',
              },
            },
            loadComponent: () =>
              import('./pages/admin/admin-overview.component').then(
                (m) => m.AdminOverviewComponent,
              ),
          },
          {
            path: 'creations',
            data: {
              header: {
                title: 'Creations',
              },
            },
            loadComponent: () =>
              import('./pages/admin/creations/admin-creations.component').then(
                (m) => m.AdminCreationsComponent,
              ),
          },
          {
            path: 'cmc-recovery',
            data: {
              header: {
                title: 'CMC Recovery',
                subtitle:
                  'Ambiguous CMC notify operations that need an admin decision.',
              },
            },
            loadComponent: () =>
              import(
                './pages/admin/cmc-recovery/admin-cmc-recovery.component'
              ).then((m) => m.AdminCmcRecoveryComponent),
          },
          {
            path: 'subscriptions',
            data: {
              header: {
                title: 'Subscriptions',
              },
            },
            loadComponent: () =>
              import(
                './pages/admin/subscriptions/admin-subscriptions.component'
              ).then((m) => m.AdminSubscriptionsComponent),
          },
          {
            path: 'licenses',
            data: {
              header: {
                title: 'Licenses',
              },
            },
            loadComponent: () =>
              import('./pages/admin/licenses/admin-licenses.component').then(
                (m) => m.AdminLicensesComponent,
              ),
          },
          {
            path: 'releases',
            data: {
              header: {
                title: 'Releases',
              },
            },
            loadComponent: () =>
              import('./pages/admin/releases/admin-releases.component').then(
                (m) => m.AdminReleasesComponent,
              ),
          },
          {
            path: 'users/:principal',
            data: {
              header: {
                title: 'User details',
              },
            },
            resolve: {
              userDetail: (
                route: ActivatedRouteSnapshot,
                state: RouterStateSnapshot,
              ) => {
                const injector = inject(EnvironmentInjector);
                return import(
                  './pages/admin/users/admin-user-detail.resolver'
                ).then((m) =>
                  runInInjectionContext(injector, () =>
                    m.adminUserDetailResolver(route, state),
                  ),
                );
              },
            },
            loadComponent: () =>
              import(
                './pages/admin/users/admin-user-detail.component'
              ).then((m) => m.AdminUserDetailComponent),
          },
          {
            path: 'users',
            data: {
              header: {
                title: 'Users',
              },
            },
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
      {
        path: 'shared-with-me',
        loadChildren: () =>
          import('@rabbithole/features/shared-with-me').then(
            (m) => m.sharedWithMeRoutes,
          ),
      },
      // Route :id with canMatch - will match only if id is a Principal
      {
        path: ':id',
        canMatch: [storageViewGuard],
        loadChildren: () =>
          import('@rabbithole/core/storage-canister-status').then(
            ({ provideStorageCanisterStatusFromRouteParam }) => [
              {
                path: '',
                providers: [provideStorageCanisterStatusFromRouteParam()],
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
                        path: 'access-requests',
                        loadChildren: () =>
                          import('@rabbithole/features/file-list').then(
                            (m) => m.accessRequestsRoutes,
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
                        './core/components/storage-metrics-footer/storage-metrics-footer.component'
                      ).then((m) => m.StorageMetricsFooterComponent),
                    outlet: 'sidebarBottom',
                  },
                  {
                    path: '',
                    loadComponent: () =>
                      import(
                        './core/components/storage-version-info-outlet/storage-version-info-outlet.component'
                      ).then((m) => m.StorageVersionInfoOutletComponent),
                    outlet: 'header',
                  },
                ],
              },
            ],
          ),
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
