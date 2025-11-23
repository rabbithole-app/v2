import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Principal } from '@dfinity/principal';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideDatabase } from '@ng-icons/lucide';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmItemImports } from '@spartan-ng/helm/item';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';

import {
  ENCRYPTED_STORAGE_CANISTER_ID,
  formatTCycles,
  ICManagementService,
} from '@rabbithole/core';
import {
  CopyToClipboardComponent,
  formatBytes,
  RbthCanisterStatusComponent,
} from '@rabbithole/ui';

@Component({
  selector: 'app-canister-card',
  imports: [
    ...HlmItemImports,
    ...HlmSkeletonImports,
    ...HlmSpinnerImports,
    NgIcon,
    HlmIcon,
    RbthCanisterStatusComponent,
    CopyToClipboardComponent,
    RouterLink,
  ],
  providers: [provideIcons({ lucideDatabase })],
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
  isLoading = computed(() =>
    this.#icManagementService().canisterStatus.isLoading(),
  );
  memory = computed(() => {
    const status = this.canisterStatus();
    if (!status?.memorySize) return '0 Bytes';
    return formatBytes(Number(status.memorySize));
  });
}
