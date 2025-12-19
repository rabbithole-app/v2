import {
  Actor,
  ActorSubclass,
  Cbor as cbor,
  Certificate,
  HashTree,
  HttpAgent,
  lookup_path,
  LookupPathStatus,
  lookupResultToBuffer,
  reconstruct,
} from '@icp-sdk/core/agent';
import { compare, lebDecode, PipeArrayBuffer } from '@icp-sdk/core/candid';
import { sha256 } from '@noble/hashes/sha2';

import { _SERVICE } from './canisters/encrypted-storage.did';
import { ContentEncoding } from './types';
import { base64Decode } from './utils/base64';
import { limit, LimitFn } from './utils/limit';

export class Asset {
  constructor(
    private readonly _actor: ActorSubclass<_SERVICE>,
    private readonly _limit: LimitFn,
    private readonly _maxSingleFileSize: number,
    private readonly _maxChunkSize: number,
    private readonly _key: string,
    private readonly _acceptEncodings: ContentEncoding[],
    private readonly _content: Uint8Array,
    public readonly contentType: string,
    public readonly length: number,
    public readonly contentEncoding: string,
    public readonly chunkSize: number,
    public readonly sha256?: Uint8Array,
  ) {}

  /**
   * Get All chunks of asset through `onChunk` callback, can be used for a custom storage implementation
   * @param onChunk Called on each received chunk
   * @param sequential Chunks are received in sequential order when true or `concurrency` is `1` in config
   */
  async getChunks(
    onChunk: (index: number, chunk: Uint8Array) => void,
    sequential?: boolean,
  ) {
    onChunk(0, this._content);
    const chunkLimit = sequential ? limit(1) : this._limit;
    await Promise.all(
      Array.from({ length: Math.ceil(this.length / this.chunkSize) - 1 }).map(
        (_, index) =>
          chunkLimit(async () => {
            const { content } = await this._actor.get_chunk({
              key: this._key,
              content_encoding: this.contentEncoding,
              index: BigInt(index + 1),
              sha256: this.sha256 ? [this.sha256] : [],
            });
            onChunk(index + 1, content as Uint8Array);
          }),
      ),
    );
  }

  /**
   * Check if asset has been certified, which means that the content's hash is in the canister hash tree
   */
  async isCertified(): Promise<boolean> {
    // Below implementation is based on Internet Computer service worker
    console.log('isCertified');
    const agent = Actor.agentOf(this._actor) ?? (await HttpAgent.create());
    const canisterId = Actor.canisterIdOf(this._actor);

    if (!agent.rootKey) {
      throw Error('Agent is missing root key');
    }

    const response = await this._limit(() =>
      this._actor.http_request({
        method: 'get',
        url: this._key,
        headers: [['Accept-Encoding', this._acceptEncodings.join(', ')]],
        body: new Uint8Array(),
        certificate_version: [],
      }),
    );

    let certificate: Uint8Array | undefined;
    let tree: Uint8Array | undefined;
    const certificateHeader = response.headers.find(
      ([key]) => key.trim().toLowerCase() === 'ic-certificate',
    );
    if (!certificateHeader) {
      return false;
    }
    const fields = certificateHeader[1].split(/,/);
    for (const f of fields) {
      const [, name, b64Value] = [...(f.match(/^(.*)=:(.*):$/) ?? [])].map(
        (x) => x.trim(),
      );
      const value = base64Decode(b64Value);
      if (name === 'certificate') {
        certificate = value;
      } else if (name === 'tree') {
        tree = value;
      }
    }

    if (!certificate || !tree) {
      // No certificate or tree in response header
      return false;
    }

    const cert = await Certificate.create({
      certificate,
      rootKey: agent.rootKey,
      principal: { canisterId },
    }).catch(() => Promise.resolve());

    if (!cert) {
      // Certificate is not valid
      return false;
    }

    // Check certificate time
    const timeLookup = cert.lookup_path(['time']);
    if (
      timeLookup.status !== LookupPathStatus.Found ||
      !(timeLookup.value instanceof Uint8Array)
    ) {
      return false;
    }

    const decodedTime = lebDecode(new PipeArrayBuffer(timeLookup.value));
    const certTime = Number(decodedTime / BigInt(1_000_000)); // Convert from nanos to millis
    const now = Date.now();
    const maxCertTimeOffset = 300_000; // 5 min
    if (
      certTime - maxCertTimeOffset > now ||
      certTime + maxCertTimeOffset < now
    ) {
      return false;
    }

    const hashTree = cbor.decode<HashTree>(tree);
    const reconstructed = await reconstruct(hashTree);
    const witness = cert.lookup_path([
      'canister',
      canisterId.toUint8Array(),
      'certified_data',
    ]);

    if (
      witness.status !== LookupPathStatus.Found ||
      !(witness.value instanceof Uint8Array)
    ) {
      // Could not find certified data for this canister in the certificate
      return false;
    }

    // First validate that the Tree is as good as the certification
    if (compare(witness.value, reconstructed) !== 0) {
      // Witness != Tree passed in ic-certification
      return false;
    }

    // Lookup hash of asset in tree
    const treeSha = lookupResultToBuffer(
      lookup_path(['http_assets', this._key], hashTree),
    );

    return !!treeSha && !!this.sha256 && compare(this.sha256, treeSha) === 0;
  }

  /**
   * Get asset content as blob (web), most browsers are able to use disk storage for larger blobs
   */
  async toBlob(): Promise<Blob> {
    const blobs = Array.from<Blob>({
      length: Math.ceil(this.length / this.chunkSize),
    });
    await this.getChunks(
      (index, chunk) => (blobs[index] = new Blob([Uint8Array.from(chunk)])),
    );
    return new Blob([...blobs]);
  }

  /**
   * Get asset content as number array, use `toBlob` (web) or `write` (Node.js) for larger files
   */
  async toNumberArray(): Promise<number[]> {
    const chunks = Array.from<number[]>({
      length: Math.ceil(this.length / this.chunkSize),
    });
    await this.getChunks((index, chunk) => (chunks[index] = Array.from(chunk)));
    return chunks.flat();
  }

  /**
   * Get asset content as unsigned 8-bit integer array, use `toBlob` (web) or `write` (Node.js) for larger files
   */
  async toUint8Array(): Promise<Uint8Array> {
    const bytes = new Uint8Array(this.length);
    await this.getChunks((index, chunk) =>
      bytes.set(chunk, index * this.chunkSize),
    );
    return bytes;
  }

  /**
   * Check if the hash of the asset data is equal to the hash that has been certified
   * @param bytes Optionally pass data to hash instead of waiting for asset data to be fetched and hashed
   */
  async verifySha256(bytes?: number[] | Uint8Array): Promise<boolean> {
    if (!this.sha256?.buffer) {
      return false;
    }
    const hash = sha256.create();
    if (bytes) {
      hash.update(Array.isArray(bytes) ? new Uint8Array(bytes) : bytes);
    } else {
      await this.getChunks((_, chunk) => hash.update(chunk), true);
    }
    return compare(this.sha256, hash.digest()) === 0;
  }
}
