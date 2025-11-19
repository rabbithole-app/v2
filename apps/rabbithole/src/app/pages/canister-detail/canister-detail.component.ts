import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  linkedSignal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Principal } from '@dfinity/principal';
import { map } from 'rxjs';

import {
  ENCRYPTED_STORAGE_CANISTER_ID,
  ICManagementService,
  ParsedCanisterStatus,
} from '@rabbithole/core';

@Component({
  selector: 'app-canister-detail',
  templateUrl: './canister-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: ENCRYPTED_STORAGE_CANISTER_ID,
      useFactory: () => {
        const route = inject(ActivatedRoute);
        const canisterId = route.snapshot.paramMap.get('id');
        if (!canisterId) {
          throw new Error('Canister ID parameter is required');
        }
        return Principal.fromText(canisterId);
      },
    },
    ICManagementService,
  ],
})
export class CanisterDetailComponent {
  #route = inject(ActivatedRoute);
  // Initialize from resolver
  #resolverStatus = toSignal(
    this.#route.data.pipe(
      map((data) => data['canisterStatus'] as ParsedCanisterStatus),
    ),
    { requireSync: true },
  );
  // Create linkedSignal that is initially bound to resolver data,
  // but can be updated independently
  canisterStatus = linkedSignal(() => this.#resolverStatus());
  // #icManagementService = inject(ICManagementService);

  constructor() {
    effect(() =>
      console.log('CanisterDetailComponent effect', this.canisterStatus()),
    );
  }

  /**
   * Refreshes canisterStatus data directly through the service
   */
  // async refreshCanisterStatus(): Promise<void> {
  //   const canisterId = this.#route.snapshot.paramMap.get('id');
  //   if (!canisterId) return;

  //   try {
  //     const status = await this.#icManagementService.getCanisterStatus(
  //       Principal.fromText(canisterId),
  //     );
  //     this.canisterStatus.set(status);
  //   } catch (error) {
  //     console.error('Failed to refresh canister status:', error);
  //   }
  // }
}
