import { ActorSubclass } from '@dfinity/agent';
import { sha256 } from '@noble/hashes/sha2';

import { Asset } from './asset';
import { AssetManagerBatch } from './asset-manager-batch';
import { AssetsCanisterRecord, getAssetsCanister } from './canisters/assets';
import { isReadable, Readable } from './readable/readable';
import { ReadableBlob } from './readable/readableBlob';
import { ReadableBytes } from './readable/readableBytes';
import { ReadableFile } from './readable/readableFile';
// import { ReadablePath } from './readable/readablePath';
import { AssetManagerConfig, ContentEncoding, StoreArgs } from './types';
import { limit, LimitFn } from './utils/limit';

export class AssetManager {
  private readonly _actor: ActorSubclass<AssetsCanisterRecord>;
  private readonly _limit: LimitFn;
  private readonly _maxChunkSize: number;
  private readonly _maxSingleFileSize: number;

  /**
   * Create assets canister manager instance
   * @param config Additional configuration options, canister id is required
   */
  constructor(config: AssetManagerConfig) {
    const { concurrency, maxSingleFileSize, maxChunkSize, ...actorConfig } =
      config;
    this._actor = getAssetsCanister(actorConfig);
    this._limit = limit(concurrency ?? 16);
    this._maxSingleFileSize = maxSingleFileSize ?? 1900000;
    this._maxChunkSize = maxChunkSize ?? 1900000;
  }

  /**
   * Create readable from store arguments
   * @param args Arguments with either a file, blob, path, bytes or custom Readable implementation
   */
  static async toReadable(...args: StoreArgs): Promise<Readable> {
    if (typeof File === 'function' && args[0] instanceof File) {
      return new ReadableFile(args[0]);
    }
    if (
      typeof Blob === 'function' &&
      args[0] instanceof Blob &&
      args[1]?.fileName
    ) {
      return new ReadableBlob(args[1].fileName, args[0]);
    }
    // if (typeof args[0] === 'string') {
    //   return await ReadablePath.create(args[0]);
    // }
    if (
      (Array.isArray(args[0]) ||
        args[0] instanceof Uint8Array ||
        args[0] instanceof ArrayBuffer) &&
      args[1]?.fileName
    ) {
      return new ReadableBytes(args[1].fileName, args[0]);
    }
    if (isReadable(args[0])) {
      return args[0];
    }

    throw new Error('Invalid arguments, readable could not be created');
  }

  /**
   * Create a batch assets operations instance, commit multiple operations in a single request
   */
  batch(): AssetManagerBatch {
    return new AssetManagerBatch(this._actor, this._limit, this._maxChunkSize);
  }

  /**
   * Delete all files from assets canister
   */
  async clear(): Promise<void> {
    await this._actor.clear({});
  }

  /**
   * Delete file from assets canister
   * @param key The path to the file on the assets canister e.g. /folder/to/my_file.txt
   */
  async delete(key: string): Promise<void> {
    await this._actor.delete_asset({ key });
  }

  /**
   * Get asset instance from assets canister
   * @param key The path to the file on the assets canister e.g. /folder/to/my_file.txt
   * @param acceptEncodings The accepted content encodings, defaults to ['identity']
   */
  public async get(
    key: string,
    acceptEncodings?: ContentEncoding[]
  ): Promise<Asset> {
    const data = await this._actor.get({
      key,
      accept_encodings: acceptEncodings ?? ['identity'],
    });

    return new Asset(
      this._actor,
      this._limit,
      this._maxSingleFileSize,
      this._maxChunkSize,
      key,
      acceptEncodings ?? ['identity'],
      data.content as Exclude<typeof data.content, number[]>,
      data.content_type,
      Number(data.total_length),
      data.content_encoding,
      data.content.length,
      data.sha256[0] as Exclude<(typeof data.sha256)[0], number[]>
    );
  }

  /**
   * Get list of all files in assets canister
   * @returns All files in asset canister
   */
  public async list(): ReturnType<AssetsCanisterRecord['list']> {
    return this._actor.list({});
  }

  /**
   * Store data on assets canister
   * @param args Arguments with either a file, blob, path, bytes or custom Readable implementation
   */
  public async store(...args: StoreArgs): Promise<string> {
    const readable = await AssetManager.toReadable(...args);
    const [, config] = args;
    const key = [
      config?.path ?? '',
      config?.fileName ?? readable.fileName,
    ].join('/');

    // If asset is small enough upload in one request else upload in chunks (batch)
    if (readable.length <= this._maxSingleFileSize) {
      config?.onProgress?.({ current: 0, total: readable.length });
      await this._limit(async () => {
        await readable.open();
        const bytes = await readable.slice(0, readable.length);
        await readable.close();
        const hash =
          config?.sha256 ??
          sha256.create().update(new Uint8Array(bytes)).digest();
        return this._actor.store({
          key,
          content: bytes,
          content_type: readable.contentType,
          sha256: [hash],
          content_encoding: config?.contentEncoding ?? 'identity',
          is_aliased: [],
        });
      });
      config?.onProgress?.({
        current: readable.length,
        total: readable.length,
      });
    } else {
      // Create batch to upload asset in chunks
      const batch = this.batch();
      await batch.store(readable, config);
      await batch.commit();
    }

    return key;
  }
}
