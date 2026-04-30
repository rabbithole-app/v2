import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import {
  PermissionsService,
  provideEncryptedStorage,
  provideUploadFilesService,
} from '@rabbithole/core/storage-runtime';

@Component({
  selector: 'app-root',
  template: `<router-outlet />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [RouterOutlet],
  providers: [provideEncryptedStorage(), provideUploadFilesService(), PermissionsService],
})
export class AppComponent {}
