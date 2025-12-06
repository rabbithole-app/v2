import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Principal } from '@dfinity/principal';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideDatabase, lucideInbox, lucideLink } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmButtonGroupImports } from '@spartan-ng/helm/button-group';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { filter, map, mergeWith } from 'rxjs';

import {
  CanisterCardComponent,
  CanistersService,
  CreateCanisterDialogComponent,
  LinkCanisterDialogComponent,
} from '@rabbithole/core';

@Component({
  selector: 'app-canisters',
  imports: [
    CanisterCardComponent,
    HlmButtonImports,
    ...HlmButtonGroupImports,
    ...HlmEmptyImports,
    HlmIcon,
    NgIcon,
  ],
  providers: [
    provideIcons({
      lucideDatabase,
      lucideInbox,
      lucideLink,
    }),
  ],
  host: {
    class: 'space-y-4',
  },
  templateUrl: './canisters.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CanistersComponent {
  #canistersService = inject(CanistersService);
  #route = inject(ActivatedRoute);
  canisterIds = toSignal(
    this.#route.data.pipe(
      map((data) =>
        (data['canisterList'] as Principal[]).map((v) => v.toText()),
      ),
      mergeWith(
        toObservable(this.#canistersService.canisters).pipe(
          filter((v) => !!v),
          map((canisters) => canisters.map((v) => v.toText())),
        ),
      ),
    ),
    { requireSync: true },
  );

  #dialogService = inject(HlmDialogService);

  protected _onCreateCanister() {
    const dialogRef = this.#dialogService.open(CreateCanisterDialogComponent, {
      contentClass: 'min-w-[500px] sm:max-w-[600px]',
    });

    dialogRef.closed$.subscribe(() => {
      // Dialog closed
    });
  }

  protected _onLinkCanister() {
    const dialogRef = this.#dialogService.open(LinkCanisterDialogComponent, {
      contentClass: 'min-w-[400px] sm:max-w-[500px]',
      context: {
        action: (canisterId: Principal) =>
          this.#canistersService.addCanister(canisterId),
        isLinking: this.#canistersService.isLinkingCanister,
      },
    });

    dialogRef.closed$.subscribe(() => {
      // Dialog closed
    });
  }
}
