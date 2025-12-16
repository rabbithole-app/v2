import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, isDevMode, signal } from '@angular/core';
import { Principal } from '@dfinity/principal';
import { map } from 'rxjs';

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
        `${isDevMode() ? `https://${import.meta.env.CANISTER_ID_ENCRYPTED_STORAGE}.localhost` : ''}/info.json`,
      )
      .pipe(map(({ id }) => Principal.fromText(id)));
  }

  setCanisterId(id: Principal) {
    this.#canisterId.set(id);
  }
}
