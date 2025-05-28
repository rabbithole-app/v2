import mime from 'mime/lite';

import { Readable } from './readable';

export class ReadableBytes implements Readable {
  public readonly fileName: string;
  public get contentType(): string {
    return mime.getType(this.fileName) ?? 'application/octet-stream';
  }

  public get length(): number {
    return this._bytes.byteLength;
  }

  private readonly _bytes: Uint8Array;

  constructor(fileName: string, bytes: ArrayBuffer | number[] | Uint8Array) {
    this.fileName = fileName;
    this._bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  }

  public async close(): Promise<void> {
    return Promise.resolve();
  }

  public async open(): Promise<void> {
    return Promise.resolve();
  }

  public async slice(start: number, end: number): Promise<Uint8Array> {
    return this._bytes.slice(start, end);
  }
}
