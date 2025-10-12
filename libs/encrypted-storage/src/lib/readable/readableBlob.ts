import mime from 'mime/lite';

import { Readable } from './readable';

export class ReadableBlob implements Readable {
  public readonly fileName: string;
  public get contentType(): string {
    return (
      this._blob.type ||
      (mime.getType(this.fileName) ?? 'application/octet-stream')
    );
  }

  public get length(): number {
    return this._blob.size;
  }

  private readonly _blob: Blob;

  constructor(fileName: string, blob: Blob) {
    this.fileName = fileName;
    this._blob = blob;
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }

  async open(): Promise<void> {
    return Promise.resolve();
  }

  async slice(start: number, end: number): Promise<Uint8Array> {
    return new Uint8Array(await this._blob.slice(start, end).arrayBuffer());
  }
}
