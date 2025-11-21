import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Principal } from '@dfinity/principal';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';
import { filter, map, mergeWith } from 'rxjs';

import { AUTH_SERVICE } from '@rabbithole/auth';
import {
  CanisterDataInfo,
  ENCRYPTED_STORAGE_CANISTER_ID,
  ICManagementService,
} from '@rabbithole/core';
import {
  CanisterControllersTableComponent,
  CanisterHealthCheckComponent,
  CanisterMemoryComponent,
  CanisterRuntimeComponent,
} from '@rabbithole/shared';

@Component({
  selector: 'app-canister-detail',
  templateUrl: './canister-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ...HlmTabsImports,
    CanisterMemoryComponent,
    CanisterRuntimeComponent,
    CanisterHealthCheckComponent,
    CanisterControllersTableComponent,
  ],
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
  #icManagementService = inject(ICManagementService);
  #route = inject(ActivatedRoute);

  // Combines initial data from resolver with reactive updates from service resource
  canisterStatus = toSignal(
    this.#route.data.pipe(
      map((data) => data['canisterStatus'] as CanisterDataInfo),
      mergeWith(
        toObservable(this.#icManagementService.canisterStatus.value).pipe(
          filter((v) => !!v),
        ),
      ),
    ),
    { requireSync: true },
  );

  controllers = computed(() => {
    const status = this.canisterStatus();
    return status?.settings.controllers ?? [];
  });

  #authService = inject(AUTH_SERVICE);

  currentPrincipalId = computed(() => {
    return this.#authService.principalId();
  });

  loadingState = computed(() => {
    return this.#icManagementService.state().loading;
  });

  protected _handleAddController(principal: Principal) {
    this.#icManagementService.addController(principal);
  }

  protected _handleRemoveController(principal: Principal) {
    this.#icManagementService.removeController(principal);
  }
}
