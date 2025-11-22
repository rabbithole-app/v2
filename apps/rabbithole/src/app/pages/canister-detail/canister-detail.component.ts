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

import { AddControllerInstructionsComponent } from '../../widgets/add-controller-instructions/add-controller-instructions.component';
import { AUTH_SERVICE } from '@rabbithole/auth';
import {
  CanisterDataInfo,
  ENCRYPTED_STORAGE_FROM_ACTIVATED_ROUTE_PROVIDER,
  ICManagementService,
  provideCoreWorker,
  UPLOAD_ASSETS_SERVICE_PROVIDERS,
  UPLOAD_SERVICE_TOKEN,
} from '@rabbithole/core';
import {
  CanisterControllersTableComponent,
  CanisterHealthCheckComponent,
  CanisterMemoryComponent,
  CanisterRuntimeComponent,
  CommitPermissionWarningComponent,
  FrontendUploadComponent,
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
    FrontendUploadComponent,
    AddControllerInstructionsComponent,
    CommitPermissionWarningComponent,
  ],
  providers: [
    ENCRYPTED_STORAGE_FROM_ACTIVATED_ROUTE_PROVIDER,
    UPLOAD_ASSETS_SERVICE_PROVIDERS,
    provideCoreWorker(),
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

  controllers = computed(() => this.canisterStatus().settings.controllers);

  #authService = inject(AUTH_SERVICE);
  currentPrincipalId = computed(() => {
    return this.#authService.principalId();
  });
  #uploadService = inject(UPLOAD_SERVICE_TOKEN);

  hasUploadPermission = computed(() => this.#uploadService.hasPermission());

  isController = computed(() => {
    const controllers = this.controllers();
    const currentPrincipalId = this.currentPrincipalId();
    return controllers.some(
      (controller) => controller.toText() === currentPrincipalId,
    );
  });

  loadingState = computed(() => this.#icManagementService.state().loading);

  protected _handleAddController(principal: Principal) {
    this.#icManagementService.addController(principal);
  }

  protected _handleRemoveController(principal: Principal) {
    this.#icManagementService.removeController(principal);
  }
}
