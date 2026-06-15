import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { fromNullable } from '@dfinity/utils';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronsDownUp,
  lucideChevronsUpDown,
  lucideInfo,
} from '@ng-icons/lucide';
import { bytesToHex } from '@noble/hashes/utils';

import {
  ENCRYPTED_STORAGE_CANISTER_ID,
  ENCRYPTED_STORAGE_FROM_ACTIVATED_ROUTE_PROVIDER,
  type EncryptedStorageActor,
  injectEncryptedStorageActor,
  provideEncryptedStorageActor,
  timeInNanosToDate,
} from '@rabbithole/core/storage-runtime';
import { CopyToClipboardComponent } from '@rabbithole/ui/copy-to-clipboard';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmHoverCardImports } from '@spartan-ng/helm/hover-card';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

interface InstalledStorageReleaseState {
  canisterId: string;
  frontendAssetTreeHash?: string;
  installedAt?: Date;
  manifestHash?: string;
  releaseTag?: string;
  schemaVersion: bigint;
  wasmHash?: string;
}

type StorageReleaseStateDto = Awaited<
  ReturnType<EncryptedStorageActor['getStorageReleaseState']>
>;

@Component({
  selector: 'rbth-core-storage-version-info',
  imports: [
    DatePipe,
    NgIcon,
    HlmBadge,
    HlmIcon,
    HlmSpinner,
    CopyToClipboardComponent,
    ...HlmButtonImports,
    ...HlmHoverCardImports,
    ...HlmTooltipImports,
  ],
  providers: [
    ENCRYPTED_STORAGE_FROM_ACTIVATED_ROUTE_PROVIDER,
    provideEncryptedStorageActor(),
    provideIcons({ lucideChevronsDownUp, lucideChevronsUpDown, lucideInfo }),
  ],
  templateUrl: './storage-version-info.component.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorageVersionInfoComponent {
  readonly #canisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID);
  readonly canisterId = this.#canisterId.toText();
  readonly #actor = injectEncryptedStorageActor();
  readonly releaseState = resource({
    params: () => ({ actor: this.#actor(), canisterId: this.canisterId }),
    loader: async ({ params }) =>
      toInstalledStorageReleaseState(
        await params.actor.getStorageReleaseState(),
        params.canisterId,
      ),
  });

  readonly releaseInfo = computed(() =>
    this.releaseState.hasValue() ? this.releaseState.value() : null,
  );

  readonly hashRows = computed(() => {
    const state = this.releaseInfo();

    return [
      { label: 'WASM', value: state?.wasmHash },
      { label: 'Frontend', value: state?.frontendAssetTreeHash },
    ];
  });

  readonly showDetails = signal(false);

  toggleDetails(): void {
    this.showDetails.update((value) => !value);
  }
}

function optionalDate(value: [] | [bigint]): Date | undefined {
  const time = fromNullable(value);
  return time === undefined ? undefined : timeInNanosToDate(time);
}

function optionalHashHex(value: [] | [Uint8Array]): string | undefined {
  const hash = fromNullable(value);
  return hash ? bytesToHex(hash) : undefined;
}

function toInstalledStorageReleaseState(
  state: StorageReleaseStateDto,
  canisterId: string,
): InstalledStorageReleaseState {
  return {
    canisterId,
    frontendAssetTreeHash: optionalHashHex(state.frontendAssetTreeHash),
    installedAt: optionalDate(state.installedAt),
    manifestHash: optionalHashHex(state.manifestHash),
    releaseTag: fromNullable(state.releaseTag),
    schemaVersion: state.schemaVersion,
    wasmHash: optionalHashHex(state.wasmHash),
  };
}
