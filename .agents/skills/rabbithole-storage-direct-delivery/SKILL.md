---
name: rabbithole-storage-direct-delivery
description: Directly deliver Rabbithole storage canister WASM and Angular frontend assets to user-owned storage canisters outside the normal GitHub release flow. Use when testing a mainnet storage canister, bypassing a release temporarily, updating both encrypted-storage WASM and apps/storage assets, using icp-cli web-linked identities for Rabbithole owners, or debugging manual storage delivery.
---

# Rabbithole storage direct delivery

Use this skill for manual delivery to an existing Rabbithole storage canister:
the `encrypted-storage` WASM module, the `apps/storage` frontend assets, or
both. This is a controlled bypass of the normal GitHub storage release flow. For
release artifacts, manifests, version selection, or backend release ingestion,
use `rabbithole-storage-release` instead.

## Guardrails

- Do not mutate mainnet until the user explicitly authorizes the exact target
  canister, identity, and action.
- Never use the anonymous identity on mainnet.
- Do not hard-code a user storage canister id in the skill or scripts.
- Prefer a web-linked owner identity over adding an agent/controller principal
  only for delivery.
- Confirm a snapshot exists before a direct WASM upgrade when the user is
  testing a live canister.
- Keep direct delivery marked as custom unless the user explicitly asks to
  register the resulting WASM hash in `rabbithole-backend`.
- Only a `rabbithole-backend` administrator can register a custom WASM hash.
  Storage owners can install custom code on canisters they control, but the
  backend subscription gate rejects unregistered module hashes as
  `invalidWasm`.

## Identity model

For user-owned storage canisters, link an `icp` identity to the same app
principal that Rabbithole uses in the browser:

```bash
icp identity link web <identity-name> --app rabbithole.app
icp identity principal --identity <identity-name>
```

Use this identity for `icp canister ... --identity <identity-name>` commands.
The app domain matters: Internet Identity gives a different principal per app
domain. If the delegation expires, refresh it:

```bash
icp identity reauth <identity-name>
```

The bundled frontend upload helper uses `@icp-sdk/core` directly and must export
the identity through `icp identity export`. It compares the exported principal
with `icp identity principal --identity <identity-name>` and aborts on mismatch.
If a web-linked identity cannot be exported as the same principal, do not use the
helper for a write; use the app drawer or implement a CLI-native upload path.

## Preflight

Before any write, collect the current state:

```bash
icp canister status -n ic --identity <identity-name> <canister-id> --json
icp canister snapshot list -n ic --identity <identity-name> <canister-id>
icp canister call -n ic --identity <identity-name> <canister-id> getStorageBackendType '()' --query --output candid
icp canister call -n ic --identity <identity-name> <canister-id> getStorageReleaseState '()' --query --output candid
icp canister call -n ic --identity <identity-name> <canister-id> getStatus '()' --query --output candid
```

For WASM upgrades, get the original owner principal from backend state, the UI,
or an owner-equivalent query. Do not infer it from the canister id.

## Build artifacts

Build both artifacts when direct delivery may touch both layers:

```bash
npx nx build storage --configuration=production --skip-nx-cache
cd apps/backend && icp build -e build encrypted-storage
```

Expected outputs:

- `dist/apps/storage/browser`
- `apps/backend/.icp/cache/artifacts/encrypted-storage`

## WASM delivery

Use direct WASM upgrade only after the user confirms the target canister and
snapshot state.

```bash
shasum -a 256 apps/backend/.icp/cache/artifacts/encrypted-storage
icp canister install -n ic --identity <identity-name> <canister-id> \
  --mode upgrade \
  --wasm-memory-persistence keep \
  --wasm apps/backend/.icp/cache/artifacts/encrypted-storage \
  --args '(record { owner = principal "<owner-principal>"; storageBackendType = opt variant { BlobStorage } })' \
  --yes
```

Use `variant { OnChain }` only when the target storage canister is intentionally
on-chain. The `owner` argument must remain the storage owner's Rabbithole app
principal.

After the upgrade, verify:

```bash
icp canister call -n ic --identity <identity-name> <canister-id> refreshSubscription '()' --output candid
icp canister call -n ic --identity <identity-name> <canister-id> getStorageReleaseState '()' --query --output candid
icp canister call -n ic --identity <identity-name> <canister-id> getStatus '()' --query --output candid
```

If the UI must recognize the direct WASM as known, ask before registering it:

```bash
icp canister call -e ic --identity <admin-identity> rabbithole-backend \
  adminRegisterWasmHash '(<hash-blob>, "<manual-label>")' --output candid
```

Do not register a hash silently. Registration is an admin-only backend action
that authorizes this exact custom module hash for subscription checks. It does
not add the build to the GitHub release list, and it does not make the build a
normal storage release.

After registering a custom hash, verify that the backend accepts it and refresh
the target storage canister:

```bash
icp canister call -n ic --identity <admin-identity> rabbithole-backend \
  isKnownWasmHash '(<hash-blob>)' --query --output candid
icp canister call -n ic --identity <identity-name> <canister-id> \
  refreshSubscription '()' --output candid
icp canister call -n ic --identity <identity-name> <canister-id> \
  getStatus '()' --query --output candid
```

## Frontend delivery

The storage frontend is served by the storage canister's Motoko `HttpAssets`
implementation. It is not a separate asset canister target from `icp.yaml`.

First verify commit access:

```bash
icp canister call -n ic --identity <identity-name> <canister-id> \
  list_permitted '(record { permission = variant { Commit } })' --output candid
```

Run a signed dry-run diff:

```bash
node .agents/skills/rabbithole-storage-direct-delivery/scripts/upload-storage-frontend-assets.mjs \
  --canister <canister-id> \
  --identity <identity-name>
```

If the diff is expected and the user authorizes the write:

```bash
COMMIT=1 node .agents/skills/rabbithole-storage-direct-delivery/scripts/upload-storage-frontend-assets.mjs \
  --canister <canister-id> \
  --identity <identity-name>
```

The helper preserves canister-generated `/info.json` and user thumbnail assets
under `/static/thumbnails/`. It updates changed existing assets via
`set_asset_content`, creates new assets through the official batch/chunk
interface, and deletes stale frontend assets.

Verify with read-only calls:

```bash
icp canister call -n ic --identity <identity-name> <canister-id> list '(record {})' --query --output candid
curl -sS --fail-with-body https://<canister-id>.icp.net/info.json
curl -sS --fail-with-body -I https://<canister-id>.icp.net/
```

## Troubleshooting

- If the frontend reports "Blob Storage is not configured for this
  environment," inspect the built `apps/storage` environment/config injection
  and `/info.json` before re-uploading.
- If the upload helper reports a principal mismatch, the identity export does
  not represent the same delegated principal that `icp` uses. Do not force the
  script; use `icp canister ... --identity <identity-name>` paths or the
  application upload drawer.
- If `commit_batch` traps in `Certs.mo`, avoid deleting and recreating changed
  assets in the same batch. The helper intentionally uses `set_asset_content`
  for changed existing assets to avoid that path.
