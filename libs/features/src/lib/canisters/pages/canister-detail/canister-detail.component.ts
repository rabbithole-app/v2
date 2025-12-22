import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Principal } from '@icp-sdk/core/principal';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBinary,
  lucidePackage,
  lucideRefreshCw,
  lucideUpload,
} from '@ng-icons/lucide';
import { BrnSelectImports } from '@spartan-ng/brain/select';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmButtonGroupImports } from '@spartan-ng/helm/button-group';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { filter, map, mergeWith } from 'rxjs';

import {
  AddControllerInstructionsComponent,
  CanisterControllersTableComponent,
  CanisterHealthCheckComponent,
  CanisterLoadSnapshotDialogComponent,
  CanisterMemoryComponent,
  CanisterRuntimeComponent,
  CanisterSnapshotsTableComponent,
  CanisterTakeSnapshotDialogComponent,
  CommitPermissionWarningComponent,
  FrontendUploadDrawerComponent,
  FrontendUploadTriggerDirective,
  WasmInstallComponent,
  WasmInstallTriggerDirective,
} from '../../components';
import { ICManagementService } from '../../services';
import { AUTH_SERVICE } from '@rabbithole/auth';
import {
  CanisterDataInfo,
  ENCRYPTED_STORAGE_CANISTER_ID,
  ENCRYPTED_STORAGE_FROM_ACTIVATED_ROUTE_PROVIDER,
  injectCoreWorker,
  UPLOAD_ASSETS_SERVICE_PROVIDERS,
  UPLOAD_SERVICE_TOKEN,
} from '@rabbithole/core';
import {
  RbthTooltipComponent,
  RbthTooltipTriggerDirective,
} from '@rabbithole/ui';

@Component({
  selector: 'feature-canister-detail',
  templateUrl: './canister-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ...BrnSelectImports,
    ...HlmButtonImports,
    ...HlmButtonGroupImports,
    ...HlmSelectImports,
    ...HlmSpinnerImports,
    HlmIcon,
    NgIcon,
    RbthTooltipComponent,
    RbthTooltipTriggerDirective,
    CanisterMemoryComponent,
    CanisterRuntimeComponent,
    CanisterHealthCheckComponent,
    CanisterControllersTableComponent,
    CanisterSnapshotsTableComponent,
    FrontendUploadDrawerComponent,
    FrontendUploadTriggerDirective,
    WasmInstallComponent,
    WasmInstallTriggerDirective,
    AddControllerInstructionsComponent,
    CommitPermissionWarningComponent,
  ],
  providers: [
    ENCRYPTED_STORAGE_FROM_ACTIVATED_ROUTE_PROVIDER,
    UPLOAD_ASSETS_SERVICE_PROVIDERS,
    ICManagementService,
    provideIcons({
      lucideBinary,
      lucidePackage,
      lucideRefreshCw,
      lucideUpload,
    }),
  ],
})
export class CanisterDetailComponent implements OnInit {
  #route = inject(ActivatedRoute);

  // List of available canisters from resolver
  readonly canisterList = toSignal(
    this.#route.data.pipe(
      map((data) =>
        (data['canisterList'] as Principal[]).map((v) => v.toText()),
      ),
    ),
    { requireSync: true },
  );
  #icManagementService = inject(ICManagementService);
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

  readonly #canisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID);

  readonly currentCanisterId = computed(() => this.#canisterId.toText());

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
  readonly isLoadingStatus = computed(() =>
    this.#icManagementService.canisterStatus.isLoading(),
  );

  readonly isProduction = input<boolean>(false);

  loadingState = computed(() => this.#icManagementService.state().loading);
  snapshots = computed(() => this.#icManagementService.snapshots.value() ?? []);

  snapshotsLoadingState = computed(() => {
    const state = this.#icManagementService.state().snapshots;
    const isLoadingSnapshots = this.#icManagementService.snapshots.isLoading();

    return {
      ...state,
      loading: isLoadingSnapshots,
    };
  });
  #coreWorkerService = injectCoreWorker();

  #dialogService = inject(HlmDialogService);
  #router = inject(Router);

  ngOnInit() {
    this.#coreWorkerService.postMessage({
      action: 'worker:init-storage',
      payload: this.#canisterId.toText(),
    });
  }

  protected _handleAddController(principal: Principal) {
    this.#icManagementService.addController(principal);
  }

  protected _handleRemoveController(principal: Principal) {
    this.#icManagementService.removeController(principal);
  }

  protected _onCanisterChange(canisterId: string[] | string | undefined) {
    if (typeof canisterId === 'string') {
      this.#router.navigate(['/canisters', canisterId]);
    }
  }

  protected _onDeleteSnapshot(id: string) {
    this.#icManagementService.deleteSnapshot(id);
  }

  protected _onReloadSnapshots() {
    this.#icManagementService.snapshots.reload();
  }

  protected _onRestoreSnapshot(id: string) {
    const dialogRef = this.#dialogService.open(
      CanisterLoadSnapshotDialogComponent,
      {
        contentClass: 'min-w-[400px] sm:max-w-[500px]',
        context: {
          state: computed(
            () => this.#icManagementService.state().snapshots.restoreStatus,
          ),
          action: () => this.#icManagementService.loadSnapshot(id),
          snapshotId: id,
        },
      },
    );

    dialogRef.closed$.subscribe((result) => {
      if (result) {
        // Snapshot was loaded successfully
      }
    });
  }

  protected _onTakeSnapshot(id?: string) {
    const dialogRef = this.#dialogService.open(
      CanisterTakeSnapshotDialogComponent,
      {
        contentClass: 'min-w-[400px] sm:max-w-[500px]',
        context: {
          state: computed(
            () => this.#icManagementService.state().snapshots.takeStatus,
          ),
          action: () => this.#icManagementService.takeSnapshot(id),
          snapshotId: id,
        },
      },
    );

    dialogRef.closed$.subscribe((result) => {
      if (result) {
        // Snapshot was created successfully
      }
    });
  }

  protected _refreshStatus() {
    this.#icManagementService.canisterStatus.reload();
  }
}
