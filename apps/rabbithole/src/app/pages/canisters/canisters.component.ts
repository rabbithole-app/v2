import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Principal } from '@dfinity/principal';
import { map } from 'rxjs';

import { CanisterCardComponent } from './canister-card.component';

@Component({
  selector: 'app-canisters',
  imports: [CanisterCardComponent],
  templateUrl: './canisters.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CanistersComponent {
  #route = inject(ActivatedRoute);

  canisterIds = toSignal(
    this.#route.data.pipe(
      map((data) =>
        (data['canisterList'] as Principal[]).map((v) => v.toText()),
      ),
    ),
    { requireSync: true },
  );
}
