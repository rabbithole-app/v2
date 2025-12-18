import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  input,
} from '@angular/core';
import { Router } from '@angular/router';
import { Principal } from '@dfinity/principal';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideDatabase, lucideEye, lucideTrash2 } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmButtonGroupImports } from '@spartan-ng/helm/button-group';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmItemImports } from '@spartan-ng/helm/item';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';

import {
  CopyToClipboardComponent,
  ENCRYPTED_STORAGE_CANISTER_ID,
  formatBytes,
  formatTCycles,
} from '@rabbithole/core';

import { CanistersService, ICManagementService } from '../../services';
import { CoreCanisterStatusComponent } from '../canister-status';
import { DeleteCanisterDialogComponent } from '../delete-canister-dialog/delete-canister-dialog.component';

@Component({
  selector: 'core-canister-card',
  imports: [
    ...HlmButtonImports,
    ...HlmButtonGroupImports,
    ...HlmItemImports,
    ...HlmSkeletonImports,
    ...HlmSpinnerImports,
    NgIcon,
    HlmIcon,
    CoreCanisterStatusComponent,
    CopyToClipboardComponent,
  ],
  providers: [provideIcons({ lucideDatabase, lucideEye, lucideTrash2 })],
  templateUrl: './canister-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CanisterCardComponent {
  canisterId = input.required<Principal | string>();
  canisterIdText = computed(() => {
    const id = this.canisterId();
    return typeof id === 'string' ? id : id.toText();
  });
  #parentInjector = inject(Injector);
  #icManagementService = computed(() => {
    const canisterIdValue = this.canisterId();
    const principal =
      typeof canisterIdValue === 'string'
        ? Principal.fromText(canisterIdValue)
        : canisterIdValue;
    const childInjector = Injector.create({
      providers: [
        {
          provide: ENCRYPTED_STORAGE_CANISTER_ID,
          useValue: principal,
        },
        ICManagementService,
      ],
      parent: this.#parentInjector,
    });

    return childInjector.get(ICManagementService);
  });
  canisterStatus = computed(() =>
    this.#icManagementService().canisterStatus.value(),
  );
  cycles = computed(() => {
    const status = this.canisterStatus();
    if (!status?.cycles) return '0 TCycles';
    return `${formatTCycles(status.cycles)} TCycles`;
  });
  error = computed(() => this.#icManagementService().canisterStatus.error());
  #canistersService = inject(CanistersService);
  isDeleting = computed(() =>
    this.#canistersService.state().deleting.includes(this.canisterIdText()),
  );
  isLoading = computed(() =>
    this.#icManagementService().canisterStatus.isLoading(),
  );
  memory = computed(() => {
    const status = this.canisterStatus();
    if (!status?.memorySize) return '0 Bytes';
    return formatBytes(Number(status.memorySize));
  });
  #dialogService = inject(HlmDialogService);
  #router = inject(Router);

  protected _onDelete() {
    const dialogRef = this.#dialogService.open(DeleteCanisterDialogComponent, {
      contentClass: 'min-w-[400px] sm:max-w-[500px]',
      context: {
        action: async () => {
          const canisterIdValue = this.canisterId();
          const principal =
            typeof canisterIdValue === 'string'
              ? Principal.fromText(canisterIdValue)
              : canisterIdValue;
          await this.#canistersService.deleteCanister(principal);
        },
      },
    });

    dialogRef.closed$.subscribe(() => {
      // Dialog closed
    });
  }

  protected _onView() {
    this.#router.navigate(['/canisters', this.canisterIdText()]);
  }
}
