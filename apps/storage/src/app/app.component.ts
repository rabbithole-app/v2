import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import {
  PermissionsService,
  provideEncryptedStorage,
  provideUploadFilesService,
} from '@rabbithole/core/storage-runtime';
import { HlmToaster } from '@spartan-ng/helm/sonner';

@Component({
  selector: 'app-root',
  template: `
    <router-outlet />
    @defer (on idle) {
      <hlm-toaster position="bottom-center" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [RouterOutlet, HlmToaster],
  providers: [provideEncryptedStorage(), provideUploadFilesService(), PermissionsService],
})
export class AppComponent {}
