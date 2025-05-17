import { AuthClientStorage } from '@dfinity/auth-client';
import { load, Store, StoreOptions } from '@tauri-apps/plugin-store';

/**
 * TauriStorage provides a persistent key-value store
 *
 * @see implements {@link AuthClientStorage}
 */
export class TauriStorage implements AuthClientStorage {
  get _store(): Promise<Store> {
    return load('store.json', this.#options);
  }

  #options: StoreOptions;

  constructor(options?: StoreOptions) {
    this.#options = options ?? { autoSave: false };
  }

  async get<T = string>(key: string): Promise<T | null> {
    const store = await this._store;
    const value = await store.get<T>(key);
    return value ?? null;
  }

  async remove(key: string): Promise<void> {
    const store = await this._store;
    await store.delete(key);
    await store.save();
  }

  async set<T = string>(key: string, value: T): Promise<void> {
    const store = await this._store;
    await store.set(key, value);
    await store.save();
  }
}
