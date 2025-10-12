import { ActorSubclass } from '@dfinity/agent';
import { sha256 } from '@noble/hashes/sha2';
import { Derived, Store } from '@tanstack/store';
import { isMatching, P } from 'ts-pattern';

import { AssetManager } from './asset-manager';
import {
  _SERVICE,
  BatchOperationKind,
} from './canisters/encrypted-storage.did';
import { CommitBatchArgs, Progress, StoreArgs, UploadState } from './types';
import { LimitFn } from './utils/limit';

type SHA256TYPE = ReturnType<typeof sha256.create>;

export class AssetManagerBatch {
  private _scheduledOperations: Array<
    (
      batch_id: bigint,
      onProgress?: (progress: Progress) => void,
    ) => Promise<BatchOperationKind[]>
  > = [];
  #progress = new Store<Record<string, { current: number; total: number }>>({});
  #sha256: Record<string, SHA256TYPE> = {};

  constructor(
    private readonly _actor: ActorSubclass<_SERVICE>,
    private readonly _limit: LimitFn,
    private readonly _maxChunkSize: number,
  ) {}

  /**
   * Commit all batch operations to assets canister
   * @param args Optional arguments with optional progress callback for commit progress
   */
  async commit(args?: CommitBatchArgs): Promise<void> {
    // Create batch
    const { batch_id } = await this._limit(() =>
      this._actor.createAssetBatch({}),
    );

    const store = new Derived({
      fn: () =>
        Object.values(this.#progress.state).reduce(
          (acc, value) => ({
            current: acc.current + value.current,
            total: acc.total + value.total,
          }),
          { current: 0, total: 0 },
        ),
      deps: [this.#progress],
    });

    const unmount = store.mount();

    // Progress callback
    if (isMatching({ onProgress: P.instanceOf(Function) }, args)) {
      store.subscribe((state) =>
        args.onProgress({
          status: UploadState.IN_PROGRESS,
          ...state.currentVal,
        }),
      );
    }

    // Execute scheduled operations
    const operations = (
      await Promise.all(
        this._scheduledOperations.map((scheduled_operation) =>
          scheduled_operation(batch_id),
        ),
      )
    ).flat();

    // Commit batch
    await this._limit(() =>
      this._actor.commitAssetBatch({ batch_id, operations }),
    );

    // Cleanup
    this._scheduledOperations = [];
    this.#sha256 = {};
    this.#progress.setState({});
    unmount();
  }

  /**
   * Insert batch operation to delete file from assets canister
   * @param key The path to the file on the assets canister e.g. /folder/to/my_file.txt
   */
  delete(key: string): void {
    this._scheduledOperations.push(async () => [{ DeleteAsset: { key } }]);
  }

  /**
   * Insert batch operation to store data on assets canister
   * @param args Arguments with either a file, blob, path, bytes or custom Readable implementation
   */
  async store(...args: StoreArgs): Promise<string> {
    const readable = await AssetManager.toReadable(...args);
    const [, config] = args;
    const key = [
      config?.path ?? '',
      config?.fileName ?? readable.fileName,
    ].join('/');

    const store = new Derived({
      fn: () => this.#progress.state[key],
      deps: [this.#progress],
    });

    const unmount = store.mount();

    if (isMatching({ onProgress: P.instanceOf(Function) }, config)) {
      store.subscribe((state) =>
        config.onProgress({
          status: UploadState.IN_PROGRESS,
          ...state.currentVal,
        }),
      );
    }

    // Check abort signal before starting upload
    if (config?.signal?.aborted) {
      throw new Error('Upload aborted');
    }

    if (!config?.sha256) {
      this.#sha256[key] = sha256.create();
    }

    // this.#sha256[key] = sha256.create();
    this.#progress.setState((state) => ({
      ...state,
      [key]: { current: 0, total: readable.length },
    }));
    this._scheduledOperations.push(async (batch_id) => {
      console.log('_scheduledOperations push', batch_id);
      await readable.open();
      try {
        const chunkCount = Math.ceil(readable.length / this._maxChunkSize);
        const chunkIds: bigint[] = await Promise.all(
          Array.from({ length: chunkCount }).map(async (_, index) => {
            const content = await readable.slice(
              index * this._maxChunkSize,
              Math.min((index + 1) * this._maxChunkSize, readable.length),
            );
            if (!config?.sha256) {
              this.#sha256[key].update(content);
            }
            const { chunk_id } = await this._limit(
              () =>
                this._actor.createAssetChunk({
                  content,
                  batch_id,
                }),
              config?.signal,
            );
            this.#progress.setState((state) => ({
              ...state,
              [key]: {
                ...state[key],
                current: state[key].current + content.length,
              },
            }));

            return chunk_id;
          }),
        );

        const headers: [[string, string][]] | [] = config?.headers
          ? [config.headers]
          : [];
        return [
          {
            CreateAsset: {
              allow_raw_access: [],
              max_age: [],
              enable_aliasing: [],
              key,
              content_type: config?.contentType ?? readable.contentType,
              headers,
            },
          },
          {
            SetAssetContent: {
              key,
              sha256: [
                config?.sha256 ?? new Uint8Array(this.#sha256[key].digest()),
              ],
              chunk_ids: chunkIds,
              content_encoding: config?.contentEncoding ?? 'identity',
            },
          },
        ] satisfies BatchOperationKind[];
      } finally {
        await readable.close();
      }
    });

    unmount();

    return key;
  }
}
