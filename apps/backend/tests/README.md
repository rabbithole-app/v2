# Backend Testing Guide

This directory contains integration tests for the Rabbithole backend canisters using [PIC.js](https://github.com/dfinity/pic-js) (PocketIC JavaScript SDK).

## Prerequisites

### Build Canisters

Ensure all canisters are built before running tests:

```bash
npx nx build backend
```

### Important: Run Tests Locally

⚠️ Running tests with NNS state inside a Docker container or sandbox environment may cause the internal PocketIC server to fail to start. It is **recommended to run tests directly on your local machine**.

## Project Structure

```
tests/
├── fixtures/
│   ├── minimal-frontend.tar      # Test frontend archive (v1)
│   └── minimal-frontend-v2.tar   # Test frontend archive (v2, for invalidation tests)
├── setup/
│   ├── backend-manager.ts    # BackendManager — extends BaseManager with backend-specific logic
│   ├── constants.ts          # Backend-specific paths + re-exports from @rabbithole/testing
│   ├── github-outcalls.ts    # HTTP outcall mocking for GitHub API
│   ├── manager.ts            # Re-exports BackendManager as Manager (backwards compatibility)
│   └── utils.ts              # Re-exports chunked install utilities from @rabbithole/testing
├── github-releases.test.ts   # Tests for GitHub releases download and invalidation
├── profiles.test.ts          # Tests for user profiles CRUD operations
├── storage-deployer.test.ts  # Tests for storage canister deployment with ICP/CMC
├── tar-extractor.test.ts     # Tests for tar.gz extraction functionality
└── README.md                 # This file
```

## Shared Testing Infrastructure

Common test utilities live in `libs/testing` (`@rabbithole/testing`):

- **`BaseManager`** — base class for PocketIC test setup (NNS state, ICP ledger, CMC, time/block control)
- **`setupChunkedCanister` / `upgradeChunkedCanister`** — chunked WASM installation for large canisters
- **`minterIdentity`** — pre-configured NNS minter identity
- **Constants** — NNS canister IDs, fees, conversion rates
- **NNS state** — pre-configured state at `libs/testing/state/nns_state/`

## Test Files Overview

### `profiles.test.ts`

Tests for user profile management:
- Create, read, update, delete profiles
- Username validation
- Profile listing with pagination, sorting, and filtering

Uses `setupChunkedCanister` directly (no Manager).

### `github-releases.test.ts`

Tests for GitHub releases functionality:
- Fetching releases via mocked HTTP outcalls
- Download status tracking
- Release readiness validation

### `storage-deployer.test.ts`

End-to-end tests for storage canister deployment:
- ICP/XDR conversion rates from CMC
- ICP Ledger balance checks
- ICRC-2 allowance and transfer operations
- Full storage creation flow with cycles

### `tar-extractor.test.ts`

Tests for tar.gz archive extraction:
- Download and extraction pipeline
- File hash verification
- Extraction progress tracking

## Running Tests

### Run All Tests

```bash
npx nx test backend
```

### Run Specific Test File

```bash
npx nx test backend -- tests/profiles.test.ts
```

### Run with Verbose Output

```bash
npx nx test backend -- --reporter=verbose
```

## Key Concepts

### Manager Hierarchy

```
BaseManager (libs/testing)           — NNS/PocketIC infrastructure
└── BackendManager (tests/setup/)    — backend-specific setup
```

**`BaseManager`** (`@rabbithole/testing`) handles:
- PocketIC instance with NNS subnet (from saved state)
- Application subnet creation
- Pre-configured ICP Ledger and CMC actors
- ICP minting and transfers
- Time and block advancement

**`BackendManager`** (`tests/setup/backend-manager.ts`) adds:
- System subnet for CMC operations
- Chrono router advancement (240 min warmup)
- `initBackendCanister()` — deploy rabbithole-backend + CMC authorization
- `upgradeBackendCanister()` — upgrade via chunked code (with `wasm_memory_persistence: keep`)

Usage:

```typescript
import { Manager } from "./setup/manager.ts";

const manager = await Manager.create();
const backendFixture = await manager.initBackendCanister();

// Use the actor
const result = await backendFixture.actor.someMethod();

// Cleanup
await manager.afterAll();
```

### HTTP Outcall Mocking

For tests that require external HTTP calls (e.g., GitHub API), use the mocking utilities in `setup/github-outcalls.ts`:

```typescript
import { runHttpDownloaderQueueProcessor, frontendV2Content } from "./setup/github-outcalls";

await runHttpDownloaderQueueProcessor(
  manager.pic,
  async () => {
    const status = await backendFixture.actor.getReleasesFullStatus();
    return status.hasDownloadedRelease;
  }
);
```

### Chunked WASM Installation

Large WASM files (>1MB) are automatically installed in chunks via the management canister. This is handled by `setupChunkedCanister` and `upgradeChunkedCanister` from `@rabbithole/testing`.

## Configuration

Test configuration is in `vitest.config.ts`:

```typescript
export default defineConfig({
  plugins: [tsconfigPaths({ root: "../../" })],
  test: {
    include: ["tests/**.test.ts"],
    globalSetup: "./global-setup.ts",
    testTimeout: 30_000,
    hookTimeout: 300_000,
    watch: false,
    pool: "forks",
  },
});
```

The `global-setup.ts` starts a PocketIC server before tests and provides the URL via Vitest's `inject()`.

> **Note on performance**: Decoding gzip archives with frontend assets inside a canister is computationally expensive. On an M1 Max, this operation takes approximately 4-5 minutes. Adjust timeouts accordingly for tests involving archive extraction.

## Troubleshooting

### Error: NNS state not found

**Problem**: Tests fail with "state path not found" error.

**Solution**: NNS state lives in `libs/testing/state/nns_state/`. Ensure it exists (copied during `libs/testing` setup).

### Error: WASM file not found

**Problem**: Canister WASM files are missing.

**Solution**: Build the canisters first:
```bash
npx nx build backend
```

### Tests timeout

**Problem**: Tests exceed the timeout limit.

**Solutions**:
- Increase test timeout in specific tests: `test('...', { timeout: 60000 }, async () => {...})`
- Ensure PocketIC server is running correctly
- Check for infinite loops in async operations

### Cycles-related errors

**Problem**: Operations fail due to insufficient cycles.

**Solution**: BaseManager mints 1,000,000 ICP to the test identity by default. For operations requiring more, use `manager.sendIcp()` to transfer additional funds.

## Resources

- [PIC.js Documentation](https://github.com/dfinity/pic-js)
- [PocketIC Documentation](https://docs.internetcomputer.org/building-apps/test/pocket-ic)
- [ICP Ledger Documentation](https://internetcomputer.org/docs/tutorials/developer-journey/level-4/4.1-icp-ledger)
- [ICRC-2 Standard](https://github.com/dfinity/ICRC-1/tree/main/standards/ICRC-2)
