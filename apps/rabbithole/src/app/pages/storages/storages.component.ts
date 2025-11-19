import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { Principal } from '@dfinity/principal';

import { StorageItemComponent } from './storage-item.component';

@Component({
  selector: 'app-storages',
  imports: [StorageItemComponent],
  templateUrl: './storages.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoragesComponent {
  canisterIds = signal<Principal[]>([
    Principal.fromText('uxrrr-q7777-77774-qaaaq-cai'),
  ]);
}
