import { gzipSync } from 'fflate';

import { extractFrontendArchive } from './frontend-archive';

describe('extractFrontendArchive', () => {
  it('extracts files from a tar archive', async () => {
    const archive = createArchiveFile(
      'frontend.tar',
      createTarArchive([
        { name: './index.html', content: '<html></html>' },
        { name: './assets/app.js', content: 'console.log(1);' },
      ]),
    );

    const entries = await extractFrontendArchive(archive);

    expect(
      entries.map((entry) => ({
        content: new TextDecoder().decode(entry.bytes),
        fileName: entry.fileName,
        path: entry.path,
      })),
    ).toEqual([
      {
        content: '<html></html>',
        fileName: 'index.html',
        path: undefined,
      },
      {
        content: 'console.log(1);',
        fileName: 'app.js',
        path: 'assets',
      },
    ]);
  });

  it('extracts files from a gzipped tar archive', async () => {
    const archive = createArchiveFile(
      'frontend.tar.gz',
      gzipSync(createTarArchive([{ name: 'index.html', content: 'ok' }])),
    );

    const entries = await extractFrontendArchive(archive);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.fileName).toBe('index.html');
    expect(new TextDecoder().decode(entries[0]?.bytes)).toBe('ok');
  });

  it('skips directories and unsafe paths', async () => {
    const archive = createArchiveFile(
      'frontend.tar',
      createTarArchive([
        { name: 'assets/', content: '', typeflag: '5' },
        { name: '../secret.txt', content: 'secret' },
        { name: '__MACOSX/._index.html', content: 'metadata' },
        { name: 'index.html', content: 'ok' },
      ]),
    );

    const entries = await extractFrontendArchive(archive);

    expect(entries.map((entry) => entry.fileName)).toEqual(['index.html']);
  });
});

type TarEntryInput = {
  content: string;
  name: string;
  typeflag?: string;
};

function createArchiveFile(name: string, bytes: Uint8Array): File {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);

  return {
    name,
    size: bytes.byteLength,
    arrayBuffer: async () => buffer,
  } as File;
}

function createTarArchive(entries: TarEntryInput[]): Uint8Array {
  const blocks: Uint8Array[] = [];

  for (const entry of entries) {
    const content = new TextEncoder().encode(entry.content);
    const header = createTarHeader(
      entry.name,
      content.byteLength,
      entry.typeflag,
    );
    blocks.push(header, content, paddingFor(content.byteLength));
  }

  blocks.push(new Uint8Array(1024));

  const total = blocks.reduce((sum, block) => sum + block.byteLength, 0);
  const tar = new Uint8Array(total);
  let offset = 0;
  for (const block of blocks) {
    tar.set(block, offset);
    offset += block.byteLength;
  }

  return tar;
}

function createTarHeader(
  name: string,
  size: number,
  typeflag = '0',
): Uint8Array {
  const header = new Uint8Array(512);

  writeString(header, 0, 100, name);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, typeflag === '5' ? 0 : size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  writeString(header, 156, 1, typeflag);
  writeString(header, 257, 6, 'ustar');
  writeString(header, 263, 2, '00');

  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  writeOctal(header, 148, 8, checksum);

  return header;
}

function paddingFor(size: number): Uint8Array {
  const remainder = size % 512;
  return new Uint8Array(remainder === 0 ? 0 : 512 - remainder);
}

function writeOctal(
  target: Uint8Array,
  offset: number,
  length: number,
  value: number,
): void {
  const encoded = value.toString(8).padStart(length - 1, '0');
  writeString(target, offset, length - 1, encoded);
  target[offset + length - 1] = 0;
}

function writeString(
  target: Uint8Array,
  offset: number,
  length: number,
  value: string,
): void {
  target.set(new TextEncoder().encode(value).slice(0, length), offset);
}
