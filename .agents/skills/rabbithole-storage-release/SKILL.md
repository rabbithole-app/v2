---
name: rabbithole-storage-release
description: Prepare, test, publish, or debug Rabbithole storage releases, including GitHub release artifacts, storage-release.json, local mock releases, act dry-runs, backend refresh, and user storage upgrade checks.
---

# Rabbithole storage release

Use this skill when the task is about creating, testing, publishing, or
debugging storage releases in this repository.

## First checks

Start from the current repo state. Do not rely on stale release-flow memory.

Read these files before changing behavior:

- `.github/workflows/release-storage.yml`
- `apps/backend/scripts/build-storage-release-manifest.mjs`
- `apps/backend/scripts/create-mock-storage-release.mjs`

Use `rg` for focused checks. Useful patterns:

```bash
rg -n "storage-release.json|releaseNotes|compatibleFrom|frontendAssetTreeHash|argStrategy" apps/backend libs/core .github
rg -n "getStorageReleaseState|getStorageUpgradePlan|startStorageUpgrade|prepareStorageRelease" apps/backend libs/core apps/storage libs/features
```

## Release contract

The GitHub release tag is `storage-v<semver>`.

`storage-release.json` is a machine contract. Keep it small:

- `schemaVersion`
- `version`
- `tagName`
- `commit`
- `frontendAssetTreeHash`
- `artifacts`
- `upgrade.argStrategy`
- `upgrade.compatibleFrom`
- `releaseNotes`

Do not put the commit-level changelog into `storage-release.json`. The build
script may use Conventional Commits to infer the version and fallback notes, but
the manifest must not become a large audit log.

The authored release notes are the single user-facing source. The GitHub release
body is the full human-readable release document. The manifest `releaseNotes`
field is a compact projection of the same source for app UI.

## Compatibility

Version ordering is SemVer. The `storage-v` prefix is a tag namespace, not part
of the SemVer value.

Upgrade permission is explicit:

- `compatibleFrom` declares source versions allowed to upgrade to the target.
- By default, the manifest script infers compatibility by comparing current and
  previous `.most` stable signatures with `moc --stable-compatible`.
- Override `compatibleFrom` only when the user explicitly asks for a manual
  release policy.
- Keep `argStrategy` as `reuseInstallArgV1` unless the backend already supports
  a new upgrade argument encoder.

## Local mock flow

Use local mocks to verify behavior before publishing.

```bash
npx nx run backend:generate-mock-assets
npx nx run backend:generate-dev-storage-release
npx nx run backend:generate-dev-storage-release -- --bump minor --keep-previous-dev
npx nx run backend:clear-dev-storage-releases
```

Expected shape:

- committed baseline lives in `apps/backend/mock/api/releases.json` and
  `apps/backend/mock/assets/storage-v0.1.0`;
- local candidates live in gitignored `releases.local.json` and
  `assets/storage-v*-dev`;
- new storage installs the configured/baseline release;
- `refreshStorageReleaseIndex()` makes mock candidates visible to upgrade plan.

## GitHub release flow

Push to `main` is a dry run: it builds candidate artifacts and writes the
candidate release body to the workflow summary.

Manual `workflow_dispatch` creates a GitHub release:

- `draft` creates or replaces a draft release for the generated tag;
- `rc` creates a prerelease and applies the `rc` prerelease suffix;
- `stable` creates a normal release;
- `dry-run` validates and uploads candidate artifacts without publishing.

User-facing release text should live in
`apps/backend/release-notes/<tag>.md` or be passed with `release_notes_file`.
For an initial release, use a short file such as:

```markdown
## Release Notes

Initial release.
```

Do not create tags or version numbers manually unless the user explicitly asks.
The release script normally uses `--auto-version` and Conventional Commits.

## Local action check

Use `act` for workflow shape and artifact checks before pushing release-flow
changes:

```bash
npx nx run backend:act-release-storage -- --release-mode dry-run
npx nx run backend:act-release-storage -- --release-mode dry-run --release-notes-file apps/backend/release-notes/storage-vX.Y.Z.md
```

If you need the exact markdown body without running the full workflow, run the
manifest script with `--release-body <path>` after artifacts exist.

## Backend verification

After publishing or changing release ingestion, verify the backend view:

```bash
icp canister call -e local rabbithole-backend refreshStorageReleaseIndex '()' --output candid
icp canister call -e local rabbithole-backend getStorageReleaseAdminStatus '()' --output candid
```

For a local reinstall, the backend must have a deployment-ready install release.
If a baseline tag is pending, inspect `manifestError`, downloaded assets, and
configured selectors before debugging UI.

After the first real stable release, update the local baseline deliberately:

```bash
npx nx run backend:sync-mock-storage-baseline -- --tag storage-vX.Y.Z
```

## Validation gates

Choose the narrowest checks that match the change:

```bash
npx nx build backend --skip-nx-cache
npx nx test backend --skip-nx-cache -- tests/build-storage-release-manifest.test.ts tests/mock-storage-release-scripts.test.ts tests/github-releases.test.ts
npx nx test core --skip-nx-cache -- storage-release-options.spec.ts
```

If frontend release UI changed, also run:

```bash
npx nx run-many -t build -p rabbithole storage --skip-nx-cache
```

## Avoid

- Do not edit `mops.lock` with absolute local paths to make CI pass.
- Do not add act-only behavior to production workflow unless the user accepts
  the tradeoff.
- Do not reintroduce draft-only local behavior as production release selection.
- Do not add fallback methods that decide upgrades from stale backend records.
- Do not put technical commit changelog data back into `storage-release.json`.
