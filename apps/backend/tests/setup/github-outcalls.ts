import { CanisterHttpHeader, HttpsOutcallResponseMock, PendingHttpsOutcall, PocketIc } from "@dfinity/pic";
import { sha256 } from "@noble/hashes/sha2";
import { parseRange, Ranges } from 'header-range-parser';
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";

import { STORAGE_FRONTEND_ARCHIVE_PATH, STORAGE_FRONTEND_V2_ARCHIVE_PATH, STORAGE_WASM_PATH } from "./constants";

// GitHub API mock data
const MOCK_RELEASE_TAG = "v0.1.0-test";
const MOCK_WASM_ASSET_NAME = "encrypted-storage.wasm.gz";
const MOCK_FRONTEND_ASSET_NAME = "storage-frontend.tar";

// Default assets (loaded once at startup)
const defaultAssets = {
  wasm: loadFileContent(STORAGE_WASM_PATH),
  frontend: loadFileContent(STORAGE_FRONTEND_ARCHIVE_PATH),
};

// Pre-loaded frontend v2 for invalidation tests
export const frontendV2Content = loadFileContent(STORAGE_FRONTEND_V2_ARCHIVE_PATH);

/**
 * Asset provider interface - allows overriding any asset content
 */
export type AssetProvider = {
  frontend: Uint8Array;
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
  assets?: Partial<AssetProvider>
): Promise<void> {
  const effectiveAssets = {
    wasm: assets?.wasm ?? defaultAssets.wasm,
    frontend: assets?.frontend ?? defaultAssets.frontend,
  };

  const assetsMeta: AssetMeta[] = [
    buildAssetMeta(MOCK_WASM_ASSET_NAME, effectiveAssets.wasm, 'application/gzip'),
    buildAssetMeta(MOCK_FRONTEND_ASSET_NAME, effectiveAssets.frontend, 'application/x-tar'),
  ];

  let attempts = 0;
  while (true) {
    const pendingOutcalls = await pic.getPendingHttpsOutcalls();

    for (const outcall of pendingOutcalls) {
      await processPendingOutcall(pic, outcall, assetsMeta);
    }

    await pic.advanceTime(100);
    await pic.tick();

    const shouldBreak = await cb();
    attempts += 1;

    if (shouldBreak || attempts > 20) {
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

function computeHash(content: Uint8Array): string {
  return Buffer.from(sha256(content)).toString("hex");
}

function createMockReleasesResponse(assets: AssetMeta[]): string {
  return JSON.stringify([
    {
      id: 1,
      name: "Test Release",
      tag_name: MOCK_RELEASE_TAG,
      body: "Test release body",
      url: `https://api.github.com/repos/rabbithole-app/v2/releases/1`,
      html_url: `https://github.com/rabbithole-app/v2/releases/tag/${MOCK_RELEASE_TAG}`,
      draft: true,
      prerelease: false,
      immutable: false,
      created_at: "2024-01-01T00:00:00Z",
      published_at: "2024-01-01T00:00:00Z",
      assets: assets.map(({ content: _, ...asset }, index) => ({
        id: index + 1,
        name: asset.name,
        label: asset.name,
        url: asset.url,
        size: asset.size,
        content_type: asset.contentType,
        browser_download_url: asset.url,
        digest: `sha256:${asset.hash}`,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      }))
    },
  ]);
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
      body = new Uint8Array(bytes.buffer);
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

function mockReleasesApiResponse(assets: AssetMeta[]): HttpsOutcallResponseMock {
  return {
    type: 'success',
    statusCode: 200,
    headers: [["Content-Type", "application/json"]],
    body: new TextEncoder().encode(createMockReleasesResponse(assets)),
  };
}

async function processPendingOutcall(
  pic: PocketIc,
  outcall: PendingHttpsOutcall,
  assets: AssetMeta[]
): Promise<void> {
  const url = outcall.url;
  console.log(`Mocking HTTP outcall to: ${url}`);

  let response: HttpsOutcallResponseMock;

  if (url.includes("/repos/") && url.includes("/releases")) {
    response = mockReleasesApiResponse(assets);
  } else {
    // Find matching asset by name in URL
    const asset = assets.find(a => url.includes(a.name));
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
