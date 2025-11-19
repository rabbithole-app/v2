import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { Principal } from '@dfinity/principal';

import { CanisterCardComponent } from './canister-card.component';

@Component({
  selector: 'app-canisters',
  imports: [CanisterCardComponent],
  templateUrl: './canisters.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CanistersComponent {
  canisterIds = signal<Principal[]>([
    Principal.fromText('uxrrr-q7777-77774-qaaaq-cai'),
    Principal.fromText('ulvla-h7777-77774-qaacq-cai'),
  ]);
}
