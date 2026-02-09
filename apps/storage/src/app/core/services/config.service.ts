import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, isDevMode, signal } from '@angular/core';
import { Principal } from '@icp-sdk/core/principal';
import { map, retry } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ConfigService {
  readonly #canisterId = signal<Principal | null>(null);
  readonly canisterId = computed(() => {
    const id = this.#canisterId();
    if (!id) {
      throw new Error(
        'ENCRYPTED_STORAGE_CANISTER_ID not initialized. Ensure init() is called before accessing canisterId.',
      );
    }
    return id;
  });
  #httpClient = inject(HttpClient);

  init() {
    return this.#httpClient
      .get<{
        id: string;
      }>(
        `${isDevMode() ? `https://${this.canisterId()}.localhost` : ''}/info.json`,
      )
      .pipe(
        retry(3),
        map(({ id }) => Principal.fromText(id)),
      );
  }

  setCanisterId(id: Principal) {
    this.#canisterId.set(id);
  }
}
