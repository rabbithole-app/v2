import { ChangeDetectionStrategy, Component } from '@angular/core';

import {
  injectStorageCanisterStatus,
} from '@rabbithole/core/storage-canister-status';

import { UpdateBannerComponent } from './update-banner.component';

@Component({
  selector: 'app-update-banner-outlet',
  imports: [UpdateBannerComponent],
  template: `
    @if (canShowUpdateBanner()) {
      <app-update-banner />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateBannerOutletComponent {
  readonly canShowUpdateBanner =
    injectStorageCanisterStatus().isCurrentUserController;
}
