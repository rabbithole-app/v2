import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { PermissionsService, provideEncryptedStorage } from '@rabbithole/core';

@Component({
  selector: 'app-root',
  template: `<router-outlet />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  providers: [provideEncryptedStorage(), PermissionsService],
})
export class AppComponent {}
