import { ActorSubclass } from '@dfinity/agent';
import { sha256 } from '@noble/hashes/sha2';

import { AssetManager } from './asset-manager';
import { AssetsCanisterRecord } from './canisters/assets';
import {
  BatchOperationKind,
  CreateAssetArguments,
} from './canisters/assets.did';
import { CommitBatchArgs, Progress, StoreArgs } from './types';
import { LimitFn } from './utils/limit';

type SHA256TYPE = ReturnType<typeof sha256.create>;

export class AssetManagerBatch {
  private _progress: { [key: string]: Progress } = {};
  private _scheduledOperations: Array<
    (
      batch_id: bigint,
      onProgress?: (progress: Progress) => void
    ) => Promise<BatchOperationKind[]>
  > = [];
  private _sha256: Record<string, SHA256TYPE> = {};

  constructor(
    private readonly _actor: ActorSubclass<AssetsCanisterRecord>,
    private readonly _limit: LimitFn,
    private readonly _maxChunkSize: number
  ) {}

  /**
   * Commit all batch operations to assets canister
   * @param args Optional arguments with optional progress callback for commit progress
   */
  async commit(args?: CommitBatchArgs): Promise<void> {
    // Create batch
    const { batch_id } = await this._limit(() => this._actor.create_batch({}));

    // Progress callback
    args?.onProgress?.({
      current: Object.values(this._progress).reduce(
        (acc, val) => acc + val.current,
        0
      ),
      total: Object.values(this._progress).reduce(
        (acc, val) => acc + val.total,
        0
      ),
    });

    // Execute scheduled operations
    const operations = (
      await Promise.all(
        this._scheduledOperations.map((scheduled_operation) =>
          scheduled_operation(batch_id, args?.onProgress)
        )
      )
    ).flat();

    // Commit batch
    await this._limit(() => this._actor.commit_batch({ batch_id, operations }));

    // Cleanup
    this._scheduledOperations = [];
    this._sha256 = {};
    this._progress = {};
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
    if (!config?.sha256) {
      this._sha256[key] = sha256.create();
    }
    this._progress[key] = { current: 0, total: readable.length };
    config?.onProgress?.(this._progress[key]);
    this._scheduledOperations.push(async (batch_id, onProgress) => {
      await readable.open();
      const chunkCount = Math.ceil(readable.length / this._maxChunkSize);
      const chunkIds: bigint[] = await Promise.all(
        Array.from({ length: chunkCount }).map(async (_, index) => {
          const content = await readable.slice(
            index * this._maxChunkSize,
            Math.min((index + 1) * this._maxChunkSize, readable.length)
          );
          if (!config?.sha256) {
            this._sha256[key].update(content);
          }
          const { chunk_id } = await this._limit(() =>
            this._actor.create_chunk({
              content,
              batch_id,
            })
          );
          this._progress[key].current += content.length;
          config?.onProgress?.(this._progress[key]);
          onProgress?.({
            current: Object.values(this._progress).reduce(
              (acc, val) => acc + val.current,
              0
            ),
            total: Object.values(this._progress).reduce(
              (acc, val) => acc + val.total,
              0
            ),
          });

          return chunk_id;
        })
      );
      await readable.close();
      const headers: [[string, string][]] | [] = config?.headers
        ? [config.headers]
        : [];
      return [
        {
          CreateAsset: <CreateAssetArguments>{
            key,
            content_type: config?.contentType ?? readable.contentType,
            headers,
          },
        },
        {
          SetAssetContent: {
            key,
            sha256: [
              config?.sha256 ?? new Uint8Array(this._sha256[key].digest()),
            ],
            chunk_ids: chunkIds,
            content_encoding: config?.contentEncoding ?? 'identity',
          },
        },
      ] satisfies BatchOperationKind[];
    });
    return key;
  }
}
