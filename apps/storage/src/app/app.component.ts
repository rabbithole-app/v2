import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import {
  PermissionsService,
  provideEncryptedStorage,
  provideUploadFilesService,
} from '@rabbithole/core/storage-runtime';
import { RbthToaster } from '@rabbithole/ui/toaster';

@Component({
  selector: 'app-root',
  template: `
    <router-outlet />
    @defer (on idle) {
      <rbth-toaster position="bottom-center" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [RouterOutlet, RbthToaster],
  providers: [provideEncryptedStorage(), provideUploadFilesService(), PermissionsService],
})
export class AppComponent {}
