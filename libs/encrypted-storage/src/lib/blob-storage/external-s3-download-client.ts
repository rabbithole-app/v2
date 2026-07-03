import type {
  BlobLocator,
  S3CompatibleTargetConfig,
  TargetView,
} from '@rabbithole/declarations/encrypted-storage';

import type { BlobStorageDownloadClient } from './download';
import type { BlobHashTreeJSON } from './merkle-tree';

export class ExternalS3PublicEncryptedClient implements BlobStorageDownloadClient {
  readonly #config: S3CompatibleTargetConfig;
  readonly #locator: BlobLocator;

  constructor(args: { locator: BlobLocator; target: TargetView }) {
    if (!('S3CompatiblePublicEncrypted' in args.target.kind)) {
      throw new Error('Unsupported external storage target kind');
    }
    this.#config = args.target.kind.S3CompatiblePublicEncrypted;
    this.#locator = args.locator;
  }

  async getBlobTree(_blobHash: string, signal?: AbortSignal): Promise<BlobHashTreeJSON> {
    const response = await fetch(s3ObjectUrl(this.#config, this.#locator.treeKey), {
      method: 'GET',
      signal,
    });
    if (!response.ok) {
      throw new Error(`External S3 tree download failed: ${response.status} ${response.statusText}`);
    }
    return await response.json() as BlobHashTreeJSON;
  }

  getDownloadUrl(_blobHash: string): string {
    return s3ObjectUrl(this.#config, this.#locator.blobKey);
  }
}

function encodeS3Key(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

function joinUrlPath(...parts: string[]): string {
  return '/' + parts
    .map((part) => part.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
}

function s3ObjectUrl(config: S3CompatibleTargetConfig, key: string): string {
  const endpoint = new URL(config.endpoint);
  const encodedKey = encodeS3Key(key);

  if (config.forcePathStyle) {
    endpoint.pathname = joinUrlPath(endpoint.pathname, config.bucket, encodedKey);
    return endpoint.toString();
  }

  endpoint.hostname = `${config.bucket}.${endpoint.hostname}`;
  endpoint.pathname = joinUrlPath(endpoint.pathname, encodedKey);
  return endpoint.toString();
}
