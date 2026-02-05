import { CanisterHttpHeader, HttpsOutcallResponseMock, PendingHttpsOutcall, PocketIc } from "@dfinity/pic";
import { sha256 } from "@noble/hashes/sha2";
import { parseRange, Ranges } from 'header-range-parser';
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { STORAGE_FRONTEND_ARCHIVE_PATH, STORAGE_WASM_PATH } from "./constants";

// GitHub API mock data
const MOCK_RELEASE_TAG = "v0.1.0-test";
const MOCK_WASM_ASSET_NAME = "encrypted-storage.wasm.gz";
const MOCK_FRONTEND_ASSET_NAME = "storage-frontend.tar";

const wasmContent = loadFileContent(STORAGE_WASM_PATH);
// Load gzipped file and decompress to get plain tar for mock
const frontendContentGzipped = loadFileContent(STORAGE_FRONTEND_ARCHIVE_PATH);
const frontendContent = frontendContentGzipped.length > 0
  ? new Uint8Array(gunzipSync(frontendContentGzipped))
  : frontendContentGzipped;

type Asset = {
  contentType: string;
  hash: string;
  name: string;
  size: number;
  url: string;
};

export async function runHttpDownloaderQueueProcessor(pic: PocketIc, cb: () => Promise<boolean>) {
  let attempts = 0;
  while (true) {
    // Get all pending HTTP outcalls
    const pendingOutcalls = await pic.getPendingHttpsOutcalls();

    for (const outcall of pendingOutcalls) {
      await processPendingHttpsOutcall(pic, outcall);
    }

    // Advance time and tick multiple times to process timers and callbacks
    await pic.advanceTime(100);
    await pic.tick();

    const shouldBreak = await cb();
    attempts += 1;

    if (shouldBreak || attempts > 20) {
      break;
    }
  }
}

// Helper to create mock GitHub releases response
function createMockReleasesResponse(assets: Asset[]) {
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
      assets: assets.map(({ contentType, url, hash, ...asset }, index) => ({
        ...asset,
        id: index + 1,
        url: url, // This is used by the parser as the download URL
        label: asset.name, // Required by parser
        content_type: contentType,
        browser_download_url: url,
        digest: `sha256:${hash}`,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      }))
    },
  ]);
}

function loadFileContent(path: string) {
  try {
    const content = readFileSync(path);
    console.log(`Loaded file ${path}: ${content.length} bytes`);
    return content;
  } catch (_e) {
    console.warn(`Warning: Could not load file from ${path}`);
    return new Uint8Array(0);
  }
}

function mockGithubAssetResponse(fileContent: Uint8Array, headers: CanisterHttpHeader[]): HttpsOutcallResponseMock {
  const rangeHeader = headers.find(([header]) => header.toLowerCase() === "range");
  let body: Uint8Array;

  if (rangeHeader) {
    const subRanges = parseRange(fileContent.length, rangeHeader[1]);
    if (subRanges instanceof Ranges) {
      const uint8arrays = subRanges.map(({ start, end }) => fileContent.slice(start, end + 1));
      const totalLength = uint8arrays.reduce((acc, u8) => acc + u8.byteLength, 0);
      const bytes = Buffer.concat(uint8arrays, totalLength);
      body = new Uint8Array(bytes.buffer);
      console.log(`Serving chunk with range ${rangeHeader[1]}: (${body.length} bytes)`);
    } else {
      body = fileContent;
    }

  } else {
    body = fileContent;
  }

  return {
    statusCode: 200,
    type: 'success',
    headers: [
      ["Content-Type", "application/gzip"],
      ["Content-Length", body.length.toString()],
    ],
    body,
  }
}

function mockGithubReleasesResponse(wasmContent: Uint8Array, frontendContent: Uint8Array): HttpsOutcallResponseMock {
  // GitHub releases API
  const wasmSha256 = Buffer.from(sha256(wasmContent)).toString("hex");
  const frontendSha256 = Buffer.from(sha256(frontendContent)).toString("hex");

  const responseBody = createMockReleasesResponse([
    {
      size: wasmContent.length,
      hash: wasmSha256,
      name: MOCK_WASM_ASSET_NAME,
      url: `https://github.com/test/repo/releases/download/${MOCK_RELEASE_TAG}/${MOCK_WASM_ASSET_NAME}`,
      contentType: 'application/gzip'
    },
    {
      size: frontendContent.length,
      hash: frontendSha256,
      name: MOCK_FRONTEND_ASSET_NAME,
      url: `https://github.com/test/repo/releases/download/${MOCK_RELEASE_TAG}/${MOCK_FRONTEND_ASSET_NAME}`,
      contentType: 'application/tar'
    }
  ]);

  return {
    type: 'success',
    statusCode: 200,
    headers: [["Content-Type", "application/json"]],
    body: new TextEncoder().encode(responseBody),
  }
}

async function processPendingHttpsOutcall(pic: PocketIc, outcall: PendingHttpsOutcall) {
  const url = outcall.url;
  console.log(`Mocking HTTP outcall to: ${url}`);
  let response: HttpsOutcallResponseMock;

  if (url.includes("/repos/") && url.includes("/releases")) {
    response = mockGithubReleasesResponse(wasmContent, frontendContent);
  } else if (url.includes(MOCK_WASM_ASSET_NAME) || url.includes("encrypted-storage")) {
    // WASM file download
    response = mockGithubAssetResponse(wasmContent, outcall.headers);
  } else if (url.includes(MOCK_FRONTEND_ASSET_NAME) || url.includes("storage-frontend")) {
    // Frontend tar.gz download
    response = mockGithubAssetResponse(frontendContent, outcall.headers);
  } else {
    console.log(`Unknown URL, returning 404`);
    response = {
      statusCode: 404,
      type: 'reject',
      message: "Not Found",
    };
  }

  await pic.mockPendingHttpsOutcall({
    requestId: outcall.requestId,
    subnetId: outcall.subnetId,
    response,
  });
}
