import { computed, inject, Injectable, resource } from '@angular/core';
import { fromNullable } from '@dfinity/utils';

import { injectMainActor } from '@rabbithole/core';

import { environment } from '../../../environments/environment';
import { ConfigService } from './config.service';

@Injectable({ providedIn: 'root' })
export class UpdateCheckService {
  readonly #actor = injectMainActor();
  readonly #configService = inject(ConfigService);

  readonly #updateResource = resource({
    params: () => ({
      actor: this.#actor(),
      canisterId: this.#configService.canisterId(),
    }),
    loader: async ({ params: { actor, canisterId } }) => {
      const result = await actor.checkStorageUpdate(canisterId);
      return fromNullable(result);
    },
  });

  readonly updateInfo = computed(() =>
    this.#updateResource.hasValue() ? this.#updateResource.value() : undefined,
  );

  readonly hasUpdate = computed(() => {
    const info = this.updateInfo();
    return !!info && (info.wasmUpdateAvailable || info.frontendUpdateAvailable);
  });

  readonly rabbitholeUrl = environment.appUrl;

  readonly updateSummary = computed(() => {
    const info = this.updateInfo();
    if (!info) return '';
    if (info.wasmUpdateAvailable && info.frontendUpdateAvailable) return 'WASM + Frontend';
    if (info.wasmUpdateAvailable) return 'WASM';
    return 'Frontend';
  });
}
