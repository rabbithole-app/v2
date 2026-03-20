import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { RbthAuthLayout, RbthAuthNavbar } from '@rabbithole/ui';

@Component({
  selector: 'app-login-layout',
  imports: [RouterOutlet, RbthAuthLayout, RbthAuthNavbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <rbth-auth-layout class="bg-grid-check-md">
      <rbth-auth-navbar navbar />
      <router-outlet />
    </rbth-auth-layout>
  `,
})
export class LoginLayoutComponent {}
