# backend

Rabbithole's Motoko canisters plus the local infrastructure needed to build,
deploy and exercise them. Built and deployed with [`icp-cli`][icp-cli]; `dfx`
is not used.

[icp-cli]: https://cli.internetcomputer.org/

## What lives in this project

| Canister                      | Role                                                   |
| ----------------------------- | ------------------------------------------------------ |
| `rabbithole-backend`          | Main Motoko backend — users, profiles, treasury, etc.  |
| `rabbithole-frontend`         | Asset canister that serves the SPA                     |
| `encrypted-storage`           | WASM template installed by backend into user storages; not deployed standalone |
| `internet_identity_backend`   | Auth logic (release-2026-04-21 — II was split)         |
| `internet_identity_frontend`  | II login UI (embedded in wasm, see *II architecture* below) |
| `xrc` / `sol_rpc` / `evm_rpc` | Pre-built canisters from DFINITY; placed on fiduciary subnet locally |

## Prerequisites

Install once on the host:

```bash
brew install icp-cli ic-wasm
npm install -g ic-mops
cargo install didc           # Candid encoder used by generate-declarations
```

- Node 22+
- Docker Desktop running
- `moc` is installed automatically by `mops toolchain` on first build

## First run

```bash
npm install                       # project deps + auto-replaces pocket-ic with the arm64 pin
npx nx install-ca backend         # trusts Caddy's local root CA so https://localhost works
```

The CA step is per workstation.

## Day-to-day

```bash
npx nx serve backend        # docker up → bootstrap → deploy-all → logs
npx nx deploy backend       # re-run bootstrap + deploy (stack already up)
npx nx compose backend -- down   # stop the stack
```

After deploy, each canister is reachable via:

- `http://<id>.localhost:8000/` — direct replica gateway
- `https://<id>.localhost/` — through Caddy (requires CA install)

## Other targets

```bash
npx nx generate-declarations backend   # moc --idl + icp-bindgen + didc encode init args
npx nx generate-mock-assets backend    # build encrypted-storage wasm + storage tar, copy into mock/
icp build rabbithole-backend           # build one canister (no deploy)
icp build -e build encrypted-storage   # same, for the template wasm
npm --prefix apps/backend test         # vitest + @dfinity/pic integration suite
```

## How the dev environment works

```
                         ┌─────────────────┐
                         │   your shell    │ icp-cli, mops, moc, ic-wasm, didc
                         │   (host)        │
                         └──────┬──────────┘
                                │ icp deploy
                                ▼
┌───────────────────── docker-compose (rabbithole) ─────────────────────┐
│                                                                        │
│  network                              caddy                            │
│  ┌────────────────────────┐           ┌──────────────────────────────┐ │
│  │ icp-cli-network-       │ ◀─────── │ HTTPS on :443                 │ │
│  │   launcher:v12.0.0-    │ internal │ reverse_proxy network:4943    │ │
│  │   2026-04-16-04-20     │          └──────────────────────────────┘ │
│  │                        │                                           │
│  │ PocketIC               │           mock-server                     │
│  │  subnets: NNS + II +   │           ┌──────────────────────────────┐│
│  │   SNS + application +  │           │ nginx serving mock/          ││
│  │   fiduciary            │           │  api/releases.json           ││
│  │                        │           │  assets/encrypted-storage.gz ││
│  │ gateway :4943 →        │           │  assets/storage-frontend.tar ││
│  │  host :8000            │           │ used by backend HTTP outcalls││
│  └────────────────────────┘           └──────────────────────────────┘│
└───────────────────────────────────────────────────────────────────────┘
```

- **Build & deploy run on the host.** `icp deploy` calls `mops`/`moc`, downloads
  prebuilt wasms, then sends install_code calls over HTTP to the launcher in
  the container.
- **Replica state lives in `./.icp-state/`** (bind-mounted). `docker compose down`
  keeps state; `rm -rf .icp-state` plus restart = fresh subnets & IDs.
- **Root key** the replica generates at boot is written to
  `./.icp-status/status.json`. `bootstrap.mjs` reads it and patches it into
  `networks/local.yaml` so `icp` CLI can verify certificates against this
  specific replica instance.

## Bootstrap chain

`npx nx serve backend` (and `deploy`) runs these sequentially:

```
1. docker compose up -d --wait
2. node scripts/bootstrap.mjs
     a. wait for .icp-status/status.json
     b. patch networks/local.yaml root-key from status.json
     c. read fiduciary subnet id from .icp-state/topology.json
     d. pre-create xrc, sol_rpc, evm_rpc with `--subnet <fid>` so they land
        on the fiduciary subnet (their wasms need threshold keys)
     e. pre-create internet_identity_backend, read its principal, patch it
        into init-args/internet_identity_frontend.did (II frontend requires
        backend_canister_id at install time)
3. icp deploy -e local --cycles 20t
     → builds Motoko, downloads prebuilt wasms, installs everything
```

`generate-declarations.mjs` is wired into `serve` so TypeScript bindings +
the `rabbithole-backend` init-args binary are regenerated before every deploy.

## Canister discovery (frontend ↔ backend)

When icp-cli deploys, it injects `PUBLIC_CANISTER_ID:<name>` as a canister
environment variable on every deployed canister. The asset canister reads
those from its own settings and serves them back to the browser via an
`ic_env` cookie, alongside the network's root key.

The rspack dev server (in `apps/rabbithole`, `apps/storage`) runs
`scripts/get-canister-env.mjs` on startup, fetches IDs + root key via
`icp network status` / `icp canister status`, and sets the same `ic_env`
cookie on every response — so dev and prod look identical to frontend code.
Set `ICP_ENVIRONMENT=staging` or `ICP_ENVIRONMENT=ic` to point the dev server
at another icp-cli environment.

Frontend code reads the cookie through `@icp-sdk/core/agent/canister-env`
and re-exports typed constants from `libs/core/src/lib/constants/canister-env.ts`:

```ts
import {
  BACKEND_CANISTER_ID,
  INTERNET_IDENTITY_FRONTEND_CANISTER_ID,
  IC_ROOT_KEY,
} from '@rabbithole/core';
```

Environment-specific public application config (RPC URLs, ICPay public key,
blob storage endpoints, etc.) lives in `rabbithole-frontend.settings.
environment_variables` in `icp.yaml` and is exposed through the same `ic_env`
cookie. Angular `environment.*` files are now thin shims that assemble app
config from those runtime values.

## Internet Identity architecture

Since release-2026-04-21, II ships as **two canisters**:

- `internet_identity_backend` — auth logic, `callerInfoSigner` / identity
  attributes, etc. Its wasm (`internet_identity_dev.wasm.gz`) does **not**
  serve any UI — probing `/` returns `Asset / not found`.
- `internet_identity_frontend` — serves the login HTML/JS. The UI files are
  *embedded* in the wasm via Rust's `include_bytes!` (not uploaded via
  candid calls like a DFINITY asset canister). Installation requires
  `backend_canister_id` in the init args so the JS knows where to send
  auth calls.

The `identityProviderUrl` used by the SPA therefore points at the
**frontend** canister: `https://<INTERNET_IDENTITY_FRONTEND_CANISTER_ID>.localhost/`.

## Init args with variants (why `didc encode`)

`rabbithole-backend` takes an `InitArgs` record containing a `tokenId`
variant with 10 labels, but the init text we write only mentions a few.
icp-cli's candid-text encoder emits variant indices relative to the *written*
labels, not the full canister-side definition — so the canister traps with
"variant index out of bounds" on install.

`generate-declarations.mjs` runs `didc encode --defs <.did> --types '(InitArgs)'`
against the freshly generated canister `.did`, producing a correct hex
payload, and icp.yaml references it via `format: hex`:

```yaml
init_args:
  path: ./init-args/rabbithole-backend.bin
  format: hex
```

## PocketIC for tests

`@dfinity/pic` (used by `apps/backend/tests/**`) bundles its own pocket-ic
binary. Its default bundle does not support the new caller-info features we
need for the auth-broker work, so `scripts/override-pocketic.mjs`
postinstall-downloads the pocket-ic from `dfinity/ic` release
`release-2026-04-16_04-20-base` (native arm64 on Apple Silicon, x86_64
elsewhere) and replaces the bundled binary in
`node_modules/@dfinity/pic/pocket-ic`. A stamp file next to the binary makes
it idempotent across installs.

## Layout

```
apps/backend/
├── icp.yaml                 # canisters + environments (local / staging / ic / build)
├── networks/
│   └── local.yaml              # root-key placeholder, rewritten by bootstrap
├── init-args/
│   ├── rabbithole-backend.did  # text source of truth (committed)
│   ├── rabbithole-backend.bin  # hex, regenerated by generate-declarations (gitignored)
│   └── internet_identity_frontend.did  # backend_canister_id rewritten by bootstrap
├── src/                     # Motoko canister sources
├── tests/                   # vitest + @dfinity/pic integration tests
├── mock/                    # nginx config + assets served to HTTP outcalls
├── networks/                # external network manifests (icp.yaml references these)
├── docker-compose.yml       # network launcher + caddy + mock-server
├── Caddyfile                # reverse_proxy to the network container
└── scripts/
    ├── bootstrap.mjs            # root-key, fiduciary pins, II backend + init-args patch
    ├── get-canister-env.mjs     # shared helper used by rspack dev servers
    ├── generate-declarations.mjs # moc --idl + icp-bindgen + didc encode
    ├── override-pocketic.mjs    # postinstall: pin pocket-ic to a specific IC release
    └── install-ca.sh            # trust Caddy's local CA in macOS keychain
```

## Troubleshooting

- **Gateway returns 000 / curl connection refused** — launcher has crashed.
  Check `docker logs rabbithole-network-1`. Usual cause is a corrupt
  `.icp-state/` after an ungraceful shutdown (look for
  "state of subnet … is incomplete"). Fix: `docker compose down && rm -rf
  .icp-state .icp-status .icp/data/mappings/local.ids.json && npx nx serve backend`.
- **`out of cycles` during install** — fiduciary canisters need more than
  the 2T default. `serve`/`deploy` targets pass `--cycles 20t`; match that
  if running `icp deploy` manually.
- **`icp project show` complains about root-key** — the committed
  `networks/local.yaml` has a placeholder. Start the stack (`npx nx serve backend`)
  so bootstrap rewrites it.
- **Tests can't find wasm** — `icp build rabbithole-backend` and
  `icp build -e build encrypted-storage` produce artifacts in
  `.icp/cache/artifacts/<name>`. Tests read from there.
- **Caddy cert not trusted** — re-run `npx nx install-ca backend`.
- **Port 4943 already allocated** — another `dfx` or `icp` network is
  running. `docker compose ls` to find, then `docker compose down` in its
  project dir.

## Known gaps — infrastructure follow-ups

1. **`libs/motoko/*` not migrated to icp-cli.** The treasury / encrypted-storage
   / icpay-webhooks libraries still have `dfx.json` + shared `libs/motoko/docker-compose.yml`
   with a dfx replica. Their test suites still read wasms from
   `libs/motoko/treasury/.dfx/local/...` — tests that depend on treasury
   will break the moment those libs are cleaned up. Mirror of what we did
   for `apps/backend`.

2. **II frontend init args via bootstrap file-patch.** icp-cli has no
   inter-canister dependency mechanism. Current solution writes the backend
   principal into `init-args/internet_identity_frontend.did` at boot — this
   leaves a permanent `git status` diff on that file after every launcher
   reset. Alternatives to consider:
   - Pass real args via `icp deploy internet_identity_frontend --args "..."`
     in bootstrap (no file patching), let the icp.yaml placeholder stand.
   - Gitignore the file + `.gitignore`, commit a `.did.tpl` template —
     makes fresh clone require bootstrap before `icp project show` works.

3. **Network and init-args placeholders produce noisy git status.** Same
   situation for `networks/local.yaml`: committed with a placeholder
   root-key, bootstrap rewrites. Nothing breaking, just visual clutter.

4. **Dev-server custom env values are mirrored in `get-canister-env.mjs`.**
   Deployed asset canisters receive public runtime config from `icp.yaml`,
   but the local rspack dev server has to synthesize the `ic_env` cookie
   before assets are served by a canister. Keep `FRONTEND_ENV` in
   `scripts/get-canister-env.mjs` aligned with `rabbithole-frontend.settings`
   in `icp.yaml`.

5. **TypeScript bindings regeneration is not CI-enforced.** `generate-declarations.mjs`
   produces `.did.js` / `.did.d.ts` / `.bin` — all committed. Nothing
   currently fails CI if a developer edits Motoko and forgets to run it.
   Add a CI drift-check (run the script, `git diff --exit-code`).

6. **`rabbithole-frontend` uses asset-canister recipe; `internet_identity_frontend`
   uses embedded-assets wasm.** Different mechanisms; mostly a doc concern,
   but worth flagging so the next maintainer isn't surprised by why one
   does `sync` and the other doesn't.

7. **`dfx.json` files inside `libs/motoko/*` still wire in IDs via
   `--specified-id`.** Moving those to icp-cli is the natural extension of
   this work. See (1).
