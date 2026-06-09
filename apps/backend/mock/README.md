# Mock GitHub release server

`apps/backend/mock` serves a local GitHub Releases API for the backend canister.
Use it to test storage updates before publishing a real GitHub release.

The committed mock state represents the current baseline release. Local
candidate releases are written to a gitignored overlay, so you can test an
upgrade without changing the committed fixture.

## Files

```text
mock/
├── api/
│   ├── releases.json        # committed baseline release index
│   └── releases.local.json  # gitignored local candidate overlay
├── assets/
│   └── storage-v0.1.0/
│       ├── encrypted-storage.wasm.gz
│       ├── encrypted-storage.did
│       ├── encrypted-storage.most
│       ├── storage-frontend.tar
│       └── storage-release.json
└── nginx.conf
```

The mock server returns `api/releases.local.json` when it exists. Otherwise, it
returns `api/releases.json`.

Local backend deployments set `STORAGE_INSTALL_RELEASE_TAG=storage-v0.1.0` and
`STORAGE_UPDATE_RELEASE_SELECTOR=latest-prerelease`. New storage canisters
start from the committed baseline even when `api/releases.local.json` contains
newer dev prereleases. Those dev prereleases stay available as upgrade targets
after **Refresh releases**.

## Test a local update

Start from the committed baseline, then generate a local candidate release.

```bash
npx nx serve backend
```

Create or install a storage canister from the committed mock baseline. Then
build a candidate release from your working tree:

```bash
npx nx run backend:generate-dev-storage-release
```

The command writes a tag-scoped release directory such as:

```text
apps/backend/mock/assets/storage-v0.1.1-dev/
```

It also writes `apps/backend/mock/api/releases.local.json`. In the admin
release UI, run **Refresh releases**. The backend downloads the candidate,
validates `storage-release.json`, extracts the frontend archive, and exposes the
update to storage cards.

By default, the candidate is the next patch version over the committed
baseline. Use `--bump minor` or `--bump major` when you need to test a different
upgrade path:

```bash
npx nx run backend:generate-dev-storage-release -- --bump minor
```

Each run replaces the local overlay unless you pass `--keep-previous-dev`. Use
that flag to keep several dev candidates with different versions:

```bash
npx nx run backend:generate-dev-storage-release -- --bump minor --keep-previous-dev
```

After testing, clear the local overlay:

```bash
npx nx run backend:clear-dev-storage-releases
```

## Refresh the committed baseline locally

Before the first public storage release, you can refresh the committed baseline
from the local build output:

```bash
npx nx run backend:generate-mock-assets
```

This command rewrites `api/releases.json` and
`assets/storage-v0.1.0/*`. Commit those files only when the baseline fixture
must change.

## Sync the committed baseline from GitHub

After public storage releases exist, sync the committed baseline from the real
GitHub release instead of rebuilding it locally:

```bash
npx nx run backend:sync-mock-storage-baseline -- --tag storage-v0.1.0
```

By default, the command reads from `rabbithole-app/v2`. Override the source with
`--owner`, `--repo`, `--api-url`, or `GITHUB_TOKEN`.

The synced mock release is written as a normal non-draft release. Drafts are
reserved for GitHub publishing workflow states and are not used as a runtime
delivery channel.

## API endpoints

| Endpoint | Description |
| --- | --- |
| `GET /health` | Health check |
| `GET /repos/{owner}/{repo}/releases` | Release list with local overlay fallback |
| `GET /assets/{tag}/{filename}` | Tag-scoped release asset download |

Asset downloads support HTTP Range requests, which the backend uses for
chunked HTTP outcalls.
