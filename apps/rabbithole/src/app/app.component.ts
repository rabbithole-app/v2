import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

import { RbthToaster } from '@rabbithole/ui';

@Component({
  imports: [RouterModule, RbthToaster],
  selector: 'app-root',
  template: ` <rbth-toaster position="bottom-center" />
    <router-outlet />`,
})
export class AppComponent {
  constructor() {
    console.log(import.meta.env);
  }
}
