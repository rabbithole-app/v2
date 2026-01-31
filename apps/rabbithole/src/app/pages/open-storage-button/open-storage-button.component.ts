import {
  ChangeDetectionStrategy,
  Component,
  inject,
  isDevMode,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLink } from '@ng-icons/lucide';

import {
  ENCRYPTED_STORAGE_CANISTER_ID,
  ENCRYPTED_STORAGE_FROM_ACTIVATED_ROUTE_PROVIDER,
} from '@rabbithole/core';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';

@Component({
  selector: 'app-open-storage-button',
  template: ` <button hlmBtn variant="outline" (click)="openStorage()">
    <ng-icon hlmIcon name="lucideLink" size="sm" />
    Open
  </button>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButtonImports, HlmIcon],
  host: {
    class: 'contents',
  },
  providers: [
    ENCRYPTED_STORAGE_FROM_ACTIVATED_ROUTE_PROVIDER,
    provideIcons({ lucideLink }),
  ],
})
export class OpenStorageButtonComponent {
  canisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID);

  openStorage() {
    window.open(
      isDevMode()
        ? `https://${this.canisterId.toText()}.localhost`
        : `https://${this.canisterId.toText()}.icp0.io`,
      '_blank',
    );
  }
}
