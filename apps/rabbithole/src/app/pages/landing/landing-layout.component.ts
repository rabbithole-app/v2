import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { RbthAuthLayout } from '@rabbithole/ui/auth-layout';

import { LandingNavbarComponent } from './components/landing-navbar/landing-navbar.component';

@Component({
  selector: 'app-landing-layout',
  imports: [RouterOutlet, RbthAuthLayout, LandingNavbarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <rbth-auth-layout class="bg-grid-check-md">
      <app-landing-navbar navbar class="z-10 sticky top-0" />
      <router-outlet />
    </rbth-auth-layout>
  `,
})
export class LandingLayoutComponent {}
