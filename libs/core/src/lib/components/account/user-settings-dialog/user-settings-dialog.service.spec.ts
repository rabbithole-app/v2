import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { UserSettingsDialogService } from './user-settings-dialog.service';

@Component({
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
class TestDialogComponent {}

@Component({
  template: '',
})
class TestPageComponent {}

@Component({
  imports: [RouterOutlet],
  template: `
    <router-outlet />
    <router-outlet name="dialog" />
  `,
})
class TestShellComponent {}

describe('UserSettingsDialogService', () => {
  it('opens account dialog under an empty-path storage shell route', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: '',
            component: TestShellComponent,
            children: [
              {
                path: '',
                redirectTo: 'drive',
                pathMatch: 'full',
              },
              {
                path: 'drive',
                component: TestPageComponent,
              },
              {
                path: '',
                component: TestPageComponent,
                outlet: 'sidebar',
              },
              {
                path: '',
                component: TestPageComponent,
                outlet: 'sidebarBottom',
              },
              {
                path: '',
                component: TestPageComponent,
                outlet: 'header',
              },
              {
                path: '',
                component: TestPageComponent,
                outlet: 'banner',
              },
            ],
          },
          {
            path: 'account',
            outlet: 'dialog',
            loadChildren: () => testDialogRoutes(),
          },
        ]),
      ],
    });

    await RouterTestingHarness.create('/drive');

    await TestBed.inject(UserSettingsDialogService).open('wallet');

    expect(TestBed.inject(Router).url).toBe('/drive(dialog:account/wallet)');
  });

  it('matches direct account dialog urls under an empty-path storage shell route', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: '',
            component: TestShellComponent,
            children: [
              {
                path: '',
                redirectTo: 'drive',
                pathMatch: 'full',
              },
              {
                path: 'drive',
                component: TestPageComponent,
              },
              {
                path: '',
                component: TestPageComponent,
                outlet: 'sidebar',
              },
              {
                path: '',
                component: TestPageComponent,
                outlet: 'sidebarBottom',
              },
              {
                path: '',
                component: TestPageComponent,
                outlet: 'header',
              },
              {
                path: '',
                component: TestPageComponent,
                outlet: 'banner',
              },
            ],
          },
          {
            path: 'account',
            outlet: 'dialog',
            loadChildren: () => testDialogRoutes(),
          },
        ]),
      ],
    });

    await RouterTestingHarness.create('/drive(dialog:account/wallet)');

    expect(TestBed.inject(Router).url).toBe('/drive(dialog:account/wallet)');
  });
});

function testDialogRoutes() {
  return [
    {
      path: '',
      component: TestDialogComponent,
      children: [
        {
          path: 'wallet',
          component: TestPageComponent,
        },
      ],
    },
  ];
}
