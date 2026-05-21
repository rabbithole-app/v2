import { gunzipSync } from 'fflate';

const TAR_BLOCK_SIZE = 512;
const TAR_NAME_OFFSET = 0;
const TAR_NAME_LENGTH = 100;
const TAR_SIZE_OFFSET = 124;
const TAR_SIZE_LENGTH = 12;
const TAR_TYPEFLAG_OFFSET = 156;
const TAR_PREFIX_OFFSET = 345;
const TAR_PREFIX_LENGTH = 155;

export type FrontendArchiveEntry = {
  bytes: Uint8Array;
  fileName: string;
  path?: string;
};

export async function extractFrontendArchive(
  file: File,
): Promise<FrontendArchiveEntry[]> {
  const archive = new Uint8Array(await file.arrayBuffer());
  const tar = isGzipArchive(file) ? gunzipSync(archive) : archive;

  return extractTarEntries(tar);
}

function decodeTarString(bytes: Uint8Array): string {
  const end = bytes.indexOf(0);
  const value = end >= 0 ? bytes.subarray(0, end) : bytes;
  return new TextDecoder().decode(value).trim();
}

function extractTarEntries(tar: Uint8Array): FrontendArchiveEntry[] {
  const entries: FrontendArchiveEntry[] = [];
  let offset = 0;
  let nextLongName: string | null = null;
  let nextPaxPath: string | null = null;

  while (offset + TAR_BLOCK_SIZE <= tar.byteLength) {
    const header = tar.subarray(offset, offset + TAR_BLOCK_SIZE);
    if (isEmptyBlock(header)) break;

    const typeflag = String.fromCharCode(header[TAR_TYPEFLAG_OFFSET] || 0);
    const size = parseOctal(header, TAR_SIZE_OFFSET, TAR_SIZE_LENGTH);
    const dataStart = offset + TAR_BLOCK_SIZE;
    const dataEnd = dataStart + size;

    if (dataEnd > tar.byteLength) {
      throw new Error('Invalid tar archive: entry extends past end of file');
    }

    if (typeflag === 'L') {
      nextLongName = decodeTarString(tar.subarray(dataStart, dataEnd));
      offset = nextTarOffset(dataEnd);
      continue;
    }

    if (typeflag === 'x') {
      nextPaxPath =
        parsePaxHeader(tar.subarray(dataStart, dataEnd))['path'] ?? null;
      offset = nextTarOffset(dataEnd);
      continue;
    }

    const rawName = nextPaxPath ?? nextLongName ?? readTarPath(header);
    nextPaxPath = null;
    nextLongName = null;

    if (isRegularFile(typeflag)) {
      const normalized = normalizeTarPath(rawName);
      if (normalized && !isIgnoredArchivePath(normalized)) {
        const segments = normalized.split('/');
        const fileName = segments.pop();
        if (fileName) {
          entries.push({
            bytes: tar.slice(dataStart, dataEnd),
            fileName,
            path: segments.length > 0 ? segments.join('/') : undefined,
          });
        }
      }
    }

    offset = nextTarOffset(dataEnd);
  }

  if (entries.length === 0) {
    throw new Error('Archive does not contain frontend files');
  }

  return entries;
}

function isEmptyBlock(block: Uint8Array): boolean {
  return block.every((byte) => byte === 0);
}

function isGzipArchive(file: File): boolean {
  return file.name.endsWith('.tar.gz') || file.name.endsWith('.tgz');
}

function isIgnoredArchivePath(path: string): boolean {
  const segments = path.split('/');
  const fileName = segments.at(-1);

  return (
    fileName === '.DS_Store' ||
    fileName === 'Thumbs.db' ||
    fileName?.startsWith('._') ||
    segments.includes('__MACOSX')
  );
}

function isRegularFile(typeflag: string): boolean {
  return typeflag === '\0' || typeflag === '' || typeflag === '0';
}

function nextTarOffset(dataEnd: number): number {
  return Math.ceil(dataEnd / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
}

function normalizeTarPath(path: string): string | null {
  const cleaned = path
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^(\.\/)+/, '');

  if (!cleaned || cleaned.endsWith('/')) return null;

  const segments = cleaned.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    return null;
  }

  return segments.join('/');
}

function parseOctal(bytes: Uint8Array, offset: number, length: number): number {
  const raw = decodeTarString(bytes.subarray(offset, offset + length));
  const value = Number.parseInt(raw.trim() || '0', 8);
  if (Number.isNaN(value)) {
    throw new Error('Invalid tar archive: invalid file size');
  }
  return value;
}

function parsePaxHeader(bytes: Uint8Array): Record<string, string> {
  const text = new TextDecoder().decode(bytes);
  const records: Record<string, string> = {};
  let offset = 0;

  while (offset < text.length) {
    const spaceIndex = text.indexOf(' ', offset);
    if (spaceIndex === -1) break;

    const length = Number.parseInt(text.slice(offset, spaceIndex), 10);
    if (!Number.isFinite(length) || length <= 0) break;

    const record = text
      .slice(spaceIndex + 1, offset + length)
      .replace(/\n$/, '');
    const equalsIndex = record.indexOf('=');
    if (equalsIndex > 0) {
      records[record.slice(0, equalsIndex)] = record.slice(equalsIndex + 1);
    }

    offset += length;
  }

  return records;
}

function readTarPath(header: Uint8Array): string {
  const name = decodeTarString(
    header.subarray(TAR_NAME_OFFSET, TAR_NAME_OFFSET + TAR_NAME_LENGTH),
  );
  const prefix = decodeTarString(
    header.subarray(TAR_PREFIX_OFFSET, TAR_PREFIX_OFFSET + TAR_PREFIX_LENGTH),
  );

  return prefix ? `${prefix}/${name}` : name;
}
