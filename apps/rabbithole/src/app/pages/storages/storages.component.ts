import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { Principal } from '@icp-sdk/core/principal';

import { StorageItemComponent } from './storage-item.component';

@Component({
  selector: 'app-storages',
  imports: [StorageItemComponent],
  templateUrl: './storages.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoragesComponent {
  canisterIds = signal<Principal[]>([
    Principal.fromText('umunu-kh777-77774-qaaca-cai'),
  ]);
}
