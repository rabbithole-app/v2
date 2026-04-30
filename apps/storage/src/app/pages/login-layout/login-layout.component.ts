import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { RbthAuthLayout } from '@rabbithole/ui/auth-layout';
import { RbthAuthNavbar } from '@rabbithole/ui/auth-navbar';

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
