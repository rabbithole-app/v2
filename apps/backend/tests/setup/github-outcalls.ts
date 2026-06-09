import { CanisterHttpHeader, HttpsOutcallResponseMock, PendingHttpsOutcall, PocketIc } from "@dfinity/pic";
import { sha256 } from "@noble/hashes/sha2";
import { addDays } from "date-fns";
import { parseRange, Ranges } from 'header-range-parser';
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";

import { STORAGE_FRONTEND_ARCHIVE_PATH, STORAGE_FRONTEND_V2_ARCHIVE_PATH, STORAGE_WASM_PATH } from "./constants";

// GitHub API mock data
const MOCK_RELEASE_TAG = "storage-v0.1.0";
const MOCK_WASM_ASSET_NAME = "encrypted-storage.wasm.gz";
const MOCK_FRONTEND_ASSET_NAME = "storage-frontend.tar";
const MOCK_MANIFEST_ASSET_NAME = "storage-release.json";
const MOCK_STABLE_SIGNATURE_ASSET_NAME = "encrypted-storage.most";
const TAR_BLOCK_BYTES = 512;
const MOCK_RELEASE_CREATED_AT = new Date("2024-01-01T00:00:00.000Z");

const CONTENT_TYPES: [string, string][] = [
  ["html", "text/html"],
  ["css", "text/css"],
  ["br", "application/brotli"],
  ["js", "text/javascript"],
  ["json", "application/json"],
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["gif", "image/gif"],
  ["svg", "image/svg+xml"],
  ["ico", "image/x-icon"],
  ["woff", "font/woff"],
  ["woff2", "font/woff2"],
  ["ttf", "font/ttf"],
  ["eot", "application/vnd.ms-fontobject"],
  ["txt", "text/plain"],
  ["xml", "application/xml"],
  ["pdf", "application/pdf"],
  ["zip", "application/zip"],
  ["wasm", "application/wasm"],
  ["gz", "application/gzip"],
];

// Default assets (loaded once at startup)
const defaultAssets = {
  wasm: loadFileContent(STORAGE_WASM_PATH),
  frontend: loadFileContent(STORAGE_FRONTEND_ARCHIVE_PATH),
  stableSignature: new TextEncoder().encode("// test stable signature\n"),
};

// Pre-loaded frontend v2 for invalidation tests
export const frontendV2Content = loadFileContent(STORAGE_FRONTEND_V2_ARCHIVE_PATH);

/**
 * Asset provider interface - allows overriding any asset content
 */
export type AssetProvider = {
  frontend: Uint8Array;
  manifest: Uint8Array | ((tag: string) => Uint8Array);
  stableSignature: Uint8Array;
  wasm: Uint8Array;
};

type AssetMeta = {
  content: Uint8Array;
  contentType: string;
  hash: string;
  name: string;
  size: number;
  url: string;
};

type ProcessorOptions = {
  maxAttempts?: number;
  releaseTags?: string[];
};

/**
 * Process HTTP outcalls with mocked GitHub responses
 *
 * @param pic - PocketIc instance
 * @param cb - Callback that returns true when processing should stop
 * @param assets - Optional asset overrides (defaults to v1 assets)
 */
export async function runHttpDownloaderQueueProcessor(
  pic: PocketIc,
  cb: () => Promise<boolean>,
  assets?: Partial<AssetProvider>,
  options?: ProcessorOptions,
): Promise<void> {
  const effectiveAssets = {
    wasm: assets?.wasm ?? defaultAssets.wasm,
    frontend: assets?.frontend ?? defaultAssets.frontend,
    manifest: assets?.manifest,
    stableSignature: assets?.stableSignature ?? defaultAssets.stableSignature,
  };

  const wasmAsset = buildAssetMeta(MOCK_WASM_ASSET_NAME, effectiveAssets.wasm, 'application/gzip');
  const frontendAsset = buildAssetMeta(MOCK_FRONTEND_ASSET_NAME, effectiveAssets.frontend, 'application/x-tar');
  const stableSignatureAsset = buildAssetMeta(MOCK_STABLE_SIGNATURE_ASSET_NAME, effectiveAssets.stableSignature, 'text/plain');
  const manifestForTag = (tag: string) => {
    if (typeof effectiveAssets.manifest === "function") {
      return effectiveAssets.manifest(tag);
    }
    return effectiveAssets.manifest ?? buildManifestContent(wasmAsset, frontendAsset, stableSignatureAsset, tag);
  };

  const assetsMeta: AssetMeta[] = [wasmAsset, frontendAsset, stableSignatureAsset];

  let attempts = 0;
  while (true) {
    const pendingOutcalls = await pic.getPendingHttpsOutcalls();

    for (const outcall of pendingOutcalls) {
      await processPendingOutcall(pic, outcall, assetsMeta, manifestForTag, options);
    }

    await pic.advanceTime(100);
    await pic.tick();

    const shouldBreak = await cb();
    attempts += 1;

    if (shouldBreak || attempts > (options?.maxAttempts ?? 20)) {
      break;
    }
  }
}

function buildAssetMeta(name: string, content: Uint8Array, contentType: string): AssetMeta {
  return {
    name,
    content,
    contentType,
    size: content.length,
    hash: computeHash(content),
    url: `https://github.com/test/repo/releases/download/${MOCK_RELEASE_TAG}/${name}`,
  };
}

function buildManifestContent(wasm: AssetMeta, frontend: AssetMeta, stableSignature: AssetMeta, tag = MOCK_RELEASE_TAG): Uint8Array {
  const version = versionFromReleaseTag(tag);
  const baselineVersion = versionFromReleaseTag(MOCK_RELEASE_TAG);

  return new TextEncoder().encode(JSON.stringify({
    schemaVersion: 1,
    version,
    tagName: tag,
    commit: "0000000000000000000000000000000000000000",
    frontendAssetTreeHash: frontendAssetTreeHash(frontend.content),
    artifacts: {
      wasm: { name: wasm.name, size: wasm.size, sha256: wasm.hash },
      frontend: { name: frontend.name, size: frontend.size, sha256: frontend.hash },
      stableSignature: { name: stableSignature.name, size: stableSignature.size, sha256: stableSignature.hash },
    },
    upgrade: {
      argStrategy: "reuseInstallArgV1",
      compatibleFrom: version === baselineVersion ? [] : [baselineVersion],
    },
    releaseNotes: {
      source: "generated",
      summary: "Storage test release.",
      sections: [],
    },
  }));
}

function computeHash(content: Uint8Array): string {
  return Buffer.from(sha256(content)).toString("hex");
}

function contentEncoding(key: string): string {
  if (key.endsWith(".gz")) return "gzip";
  if (key.endsWith(".br")) return "br";
  return "identity";
}

function createMockReleasesResponse(
  assets: AssetMeta[],
  manifestForTag: (tag: string) => Uint8Array,
  releaseTags = [MOCK_RELEASE_TAG],
): string {
  return JSON.stringify(releaseTags.map((tag, releaseIndex) => {
    const releaseDate = addDays(MOCK_RELEASE_CREATED_AT, releaseIndex).toISOString();
    const manifestAsset = buildAssetMeta(MOCK_MANIFEST_ASSET_NAME, manifestForTag(tag), 'application/json');
    const releaseAssets = [...assets, manifestAsset];
    return {
      id: releaseIndex + 1,
      name: `Test Release ${tag}`,
      tag_name: tag,
      body: `Test release body for ${tag}`,
      url: `https://api.github.com/repos/rabbithole-app/v2/releases/${releaseIndex + 1}`,
      html_url: `https://github.com/rabbithole-app/v2/releases/tag/${tag}`,
      draft: false,
      prerelease: versionFromReleaseTag(tag).includes("-"),
      immutable: false,
      created_at: releaseDate,
      published_at: releaseDate,
      assets: releaseAssets.map(({ content: _, ...asset }, index) => ({
        id: releaseIndex * 100 + index + 1,
        name: asset.name,
        label: asset.name,
        url: `https://github.com/test/repo/releases/download/${tag}/${asset.name}`,
        size: asset.size,
        content_type: asset.contentType,
        browser_download_url: `https://github.com/test/repo/releases/download/${tag}/${asset.name}`,
        digest: `sha256:${asset.hash}`,
        created_at: releaseDate,
        updated_at: releaseDate,
      }))
    };
  }));
}

function frontendAssetTreeHash(frontendTar: Uint8Array): string {
  const buffer = Buffer.from(frontendTar);
  const files: { contentEncoding: string; contentType: string; hash: string; key: string; size: number; }[] = [];
  let offset = 0;

  while (offset + TAR_BLOCK_BYTES <= buffer.length) {
    if (isEmptyTarBlock(buffer, offset)) break;

    const name = tarString(buffer, offset, 100);
    const prefix = tarString(buffer, offset + 345, 155);
    const fullName = prefix ? `${prefix}/${name}` : name;
    const size = tarOctal(buffer, offset + 124, 12);
    const typeflag = String.fromCharCode(buffer[offset + 156] || 0);
    const contentOffset = offset + TAR_BLOCK_BYTES;
    const contentEnd = contentOffset + size;

    if ((typeflag === "0" || typeflag === "\0" || typeflag === "") && fullName && !isAppleDoubleFile(fullName)) {
      const key = normalizeTarKey(fullName);
      files.push({
        key,
        contentType: inferContentType(fullName),
        contentEncoding: contentEncoding(key),
        size,
        hash: computeHash(buffer.subarray(contentOffset, contentEnd)),
      });
    }

    offset = contentOffset + Math.ceil(size / TAR_BLOCK_BYTES) * TAR_BLOCK_BYTES;
  }

  const hash = Buffer.from(sha256(new TextEncoder().encode([
    "rabbithole-storage-frontend-assets-v1\n",
    ...files
      .sort((a, b) => a.key.localeCompare(b.key))
      .flatMap(file => [file.key, file.contentType, file.contentEncoding, String(file.size), file.hash])
      .map(value => `${value.length}:${value}`),
  ].join("")))).toString("hex");

  return hash;
}

function inferContentType(path: string): string {
  return CONTENT_TYPES.find(([extension]) => path.endsWith(`.${extension}`))?.[1] ?? "application/octet-stream";
}

function isAppleDoubleFile(name: string): boolean {
  return name.includes("/._") || name.startsWith("._");
}

function isEmptyTarBlock(buffer: Buffer, offset: number): boolean {
  for (let i = 0; i < TAR_BLOCK_BYTES; i += 1) {
    if (buffer[offset + i] !== 0) return false;
  }
  return true;
}

function loadFileContent(path: string): Uint8Array {
  try {
    const content = readFileSync(path);
    console.log(`Loaded file ${path}: ${content.length} bytes`);
    return new Uint8Array(content);
  } catch (_e) {
    console.warn(`Warning: Could not load file from ${path}`);
    return new Uint8Array(0);
  }
}

function mockAssetDownloadResponse(content: Uint8Array, headers: CanisterHttpHeader[]): HttpsOutcallResponseMock {
  const rangeHeader = headers.find(([header]) => header.toLowerCase() === "range");
  let body: Uint8Array;

  if (rangeHeader) {
    const subRanges = parseRange(content.length, rangeHeader[1]);
    if (subRanges instanceof Ranges) {
      const uint8arrays = subRanges.map(({ start, end }) => content.slice(start, end + 1));
      const totalLength = uint8arrays.reduce((acc, u8) => acc + u8.byteLength, 0);
      const bytes = Buffer.concat(uint8arrays, totalLength);
      body = new Uint8Array(bytes);
      console.log(`Serving chunk with range ${rangeHeader[1]}: (${body.length} bytes)`);
    } else {
      body = content;
    }
  } else {
    body = content;
  }

  return {
    statusCode: 200,
    type: 'success',
    headers: [
      ["Content-Type", "application/octet-stream"],
      ["Content-Length", body.length.toString()],
    ],
    body,
  };
}

function mockReleasesApiResponse(
  assets: AssetMeta[],
  manifestForTag: (tag: string) => Uint8Array,
  options?: ProcessorOptions,
): HttpsOutcallResponseMock {
  return {
    type: 'success',
    statusCode: 200,
    headers: [["Content-Type", "application/json"]],
    body: new TextEncoder().encode(createMockReleasesResponse(assets, manifestForTag, options?.releaseTags)),
  };
}

function normalizeTarKey(name: string): string {
  return name.startsWith(".") ? name.slice(1) : name;
}

async function processPendingOutcall(
  pic: PocketIc,
  outcall: PendingHttpsOutcall,
  assets: AssetMeta[],
  manifestForTag: (tag: string) => Uint8Array,
  options?: ProcessorOptions,
): Promise<void> {
  const url = outcall.url;
  console.log(`Mocking HTTP outcall to: ${url}`);

  let response: HttpsOutcallResponseMock;

  if (url.includes("/repos/") && url.includes("/releases")) {
    response = mockReleasesApiResponse(assets, manifestForTag, options);
  } else {
    // Find matching asset by name in URL
    const releaseTag = options?.releaseTags?.find(tag => url.includes(`/download/${tag}/`)) ?? MOCK_RELEASE_TAG;
    const asset = url.includes(MOCK_MANIFEST_ASSET_NAME)
      ? buildAssetMeta(MOCK_MANIFEST_ASSET_NAME, manifestForTag(releaseTag), 'application/json')
      : assets.find(a => url.includes(a.name));
    if (asset) {
      response = mockAssetDownloadResponse(asset.content, outcall.headers);
    } else {
      console.log(`Unknown URL, returning 404`);
      response = {
        statusCode: 404,
        type: 'reject',
        message: "Not Found",
      };
    }
  }

  await pic.mockPendingHttpsOutcall({
    requestId: outcall.requestId,
    subnetId: outcall.subnetId,
    response,
  });
}

function tarOctal(buffer: Buffer, offset: number, length: number): number {
  const raw = tarString(buffer, offset, length).replace(/\0/g, "").trim();
  return raw ? Number.parseInt(raw, 8) : 0;
}

function tarString(buffer: Buffer, offset: number, length: number): string {
  const end = buffer.indexOf(0, offset);
  return buffer
    .subarray(offset, end >= offset && end < offset + length ? end : offset + length)
    .toString("utf8")
    .trim();
}

function versionFromReleaseTag(tag: string): string {
  return tag.replace(/^storage-v/, "").replace(/^v/, "");
}
