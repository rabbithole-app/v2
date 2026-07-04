# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Orchestration workflow

You (Fable) are the orchestrator. Plan, decompose, synthesize.

- Reasoning-heavy phases (architecture, complex debugging, algorithm design) → delegate to **deep-reasoner** (Opus).
- Mechanical work (boilerplate, tests, formatting, simple edits) → delegate to **fast-worker** (Sonnet).
- **Codex** (`/codex:rescue --background`) is a cracked engineer on par with deep-reasoner, from a different perspective. Treat it as a peer, not a reviewer.
- **High-stakes decisions:** task Opus (deep-reasoner) and Codex on the same problem in parallel, then synthesize the best of both — without showing either one the other's answer. Keep your own context lean.

## Project Overview

This is an Nx monorepo for a decentralized application built on the Internet Computer Protocol (ICP). The project combines an Angular 21 frontend with Motoko smart contracts (canisters) for blockchain backend functionality. The main application is "Rabbithole" - a file storage and management system with encryption capabilities. Storage can live on-chain (encrypted-storage canisters) or off-chain via external blob storage (S3-compatible, MinIO locally).

## Architecture

### Monorepo Structure

- **apps/rabbithole**: Main Angular 21 application (frontend)
- **apps/backend**: ICP backend with Motoko canisters, managed by **icp-cli** (`icp.yaml`). Includes treasury as a mixin library.
- **apps/storage**: Storage-canister frontend Angular application (assets served from user storage canisters)
- **apps/mobile**: Mobile application
- **apps/tauri-app**: Desktop application using Tauri (Rust)
- **apps/docs**: Documentation site
- **apps/blob-storage-poc**, **apps/tauri-poc**: Proof-of-concept apps (not part of the main build)
- **apps/\*-e2e**: E2E test projects using Playwright
- **libs/**: Shared libraries organized by domain
- **libs/motoko/**: Motoko canister libraries (shared Docker infrastructure)
- **infra/motoko-dev/**: Shared Dockerfile and entrypoint for all Motoko projects

### Key Libraries

- **libs/core**: Core services for IC management, file system access, WASM handling, and upload functionality. Exposes many subpath entry points (`@rabbithole/core/app-runtime`, `/storage-runtime`, `/wallet`, `/profile`, etc.)
- **libs/auth**: Authentication services and guards for ICP identity management (plus `@rabbithole/auth/tauri`)
- **libs/encrypted-storage**: Encrypted storage implementation and services (client-side encryption, blob-storage download, thumbnails)
- **libs/features**: Feature modules (`file-list`, `payment`, `storages`, `canisters`, `releases`, `shared-with-me`, `storage-overview`, `allowances`)
- **libs/pages**: Routed page components (`dashboard`, `login`, `profile`, `wallet`, `account-dialog`)
- **libs/declarations**: TypeScript declarations generated from Motoko canisters (`@rabbithole/declarations/{backend,encrypted-storage,icp-ledger,icrc-ledger}`)
- **libs/app-ui**: Application-specific UI components, exposed as `@rabbithole/ui` (+ many subpaths: `/sidebar`, `/tree`, `/metric-card`, ...)
- **libs/ui**: Spartan-ng component library (shadcn-like for Angular), exposed as `@spartan-ng/helm/*`
- **libs/testing**: Test helpers and signers (`@rabbithole/testing`, `/evm`, `/sol`)
- **libs/utils**: Utility functions
- **libs/shared-assets**, **libs/storage-version-info**: Shared assets and storage version metadata

### Motoko Libraries (libs/motoko/)

- **libs/motoko/encrypted-storage** (nx project `encrypted-storage-mo`): Encrypted storage canister library (used by backend)
- **libs/motoko/treasury** (nx project `treasury-mo`): Treasury library (payments, fund distribution — used by backend as mixin)
- **libs/motoko/icpay-webhooks** (nx project `icpay-webhooks-mo`): ICPay webhook handler library
- **libs/motoko/auth-jwt** (nx project `auth-jwt-mo`): JWT authentication library

All Motoko libraries share a single Docker container (`libs/motoko/docker-compose.yml`) built from `infra/motoko-dev/Dockerfile`. Build/test commands run via `docker compose exec`.

### Backend (Internet Computer)

The backend runs on ICP using Motoko smart contracts (canisters). It is built and deployed with **icp-cli** (`icp build` / `icp deploy`), configured in `apps/backend/icp.yaml` (environments: `local`, `staging`, `ic`, `build`). Canisters:

- **rabbithole-backend**: Main backend canister (src/main.mo). Composed from many mixin modules under `src/` (BlobStorage, Payments, Treasury, Subscriptions, Users, SharedAccess, StorageDeployer, Notifications, IdentityVerification, KnownWasmHashes, Settings, AvatarStorage, etc.)
- **encrypted-storage**: Per-user storage canister with encryption (src/EncryptedStorageCanister.mo). Deployed into user storage canisters by rabbithole-backend, not standalone.
- **rabbithole-frontend**: Asset canister (`@dfinity/asset-canister`) serving the frontend
- **internet-identity / internet_identity_backend**: ICP authentication canister (external)
- **icp-ledger / icrc-ledger**: ICP / ICRC token ledgers (external)

Backend local development uses Docker Compose. Services in `apps/backend/docker-compose.yml`:

- **network**: `icp-cli-network-launcher` — the local IC replica (replaces the old standalone dfx replica)
- **caddy**: reverse proxy for HTTPS
- **mock-server**: mock GitHub releases / storage assets
- **openid-provider**: local OpenID provider for auth-broker flows
- **https-outcall-proxy**: proxies canister HTTPS outcalls locally
- **minio** + **minio-init**: S3-compatible object storage for external blob storage

Serve/deploy runs `docker compose up`, then `scripts/bootstrap.mjs`, `scripts/generate-declarations.mjs`, `icp deploy -e local`, and `scripts/sync-env.sh local`.

Motoko tooling:

- Shared Dockerfile at `infra/motoko-dev/Dockerfile` (all Motoko projects)
- Shared entrypoint base at `infra/motoko-dev/entrypoint-base.sh`
- Mops package manager for Motoko dependencies

Motoko-library containers:
- **libs/motoko**: single shared replica (`replica` service) for all Motoko libraries (encrypted-storage, treasury, icpay-webhooks, auth-jwt)

## Development Commands

### Starting Development

```bash
# Start main app + storage frontend together (nx run-many serve rabbithole storage)
npm start

# Start just the main application
npx nx serve rabbithole

# Start backend only (Docker Compose + icp-cli)
npx nx serve backend

# Start storage application
npx nx serve storage

# Start Tauri desktop app in dev mode
npm run tauri:dev
```

### Building

```bash
# Build frontend
npm run build:frontend
# or
npx nx build rabbithole

# Build with Rsdoctor for bundle analysis
npm run build:frontend-rsdoctor

# Build Tauri desktop app
npm run tauri:build

# Build backend canisters (icp build)
npx nx build backend

# Deploy backend canisters locally (docker compose up + bootstrap + generate-declarations + icp deploy + sync-env)
npx nx deploy backend
```

### Testing

```bash
# Run all tests for main projects
npm test

# Run tests for specific project
npx nx test <project-name>

# Run tests with coverage (CI mode)
npx nx test <project-name> --configuration=ci

# E2E tests
npx nx e2e rabbithole-e2e
npx nx e2e storage-e2e
```

### Linting

```bash
# Lint all projects
npm run lint

# Lint specific project
npx nx lint <project-name>
```

### Backend-Specific Commands

```bash
# Generate TypeScript declarations from Motoko canisters
# (uses icp-bindgen; writes to libs/declarations/src/<canister>/)
npx nx run backend:generate-declarations

# Reset the local environment (canisters, mappings, state)
npx nx run backend:reset-local

# Install CA certificate for local HTTPS
npx nx run backend:install-ca

# Run Docker Compose commands (service names: network, caddy, mock-server, minio, ...)
npx nx compose backend -- <docker-compose-args>
```

## Project-Specific Details

### Path Aliases

The project uses path aliases defined in tsconfig.base.json (many have `/subpath` entry points — check tsconfig.base.json for the full list):

- `@rabbithole/core` → Core services (`libs/core`) — plus subpaths like `/app-runtime`, `/storage-runtime`, `/wallet`, `/profile`
- `@rabbithole/auth` → Authentication (`libs/auth`) — plus `@rabbithole/auth/tauri`
- `@rabbithole/ui` → App UI components (`libs/app-ui`) — plus many subpaths (`/sidebar`, `/tree`, `/metric-card`, ...)
- `@rabbithole/features` / `@rabbithole/pages` → Feature modules (`libs/features`) and routed pages (`libs/pages`)
- `@rabbithole/encrypted-storage` → Encrypted storage (`libs/encrypted-storage`)
- `@rabbithole/declarations` → Generated canister declarations — subpaths `/backend`, `/encrypted-storage`, `/icp-ledger`, `/icrc-ledger`
- `@rabbithole/testing` → Test helpers (`libs/testing`) — plus `/evm`, `/sol`
- `@spartan-ng/helm/*` → Spartan-ng UI component library (`libs/ui/*`)

### WebAssembly Configuration

The project uses WebAssembly modules (configured in rspack.config.ts):

- Async WASM support enabled
- Special handling for photon_rs_bg.wasm (image processing)
- WASM modules loaded via fetch

### Environment Variables

Backend/canister environment is synced into the frontend by `apps/backend/scripts/sync-env.sh <env>` (run automatically by serve/deploy). `PUBLIC_*` and canister-id values (declared per-environment in `icp.yaml`) are exposed to the app:

- Injected at build time via Rspack `DefinePlugin` as `import.meta.env`
- Access via `import.meta.env` in code (e.g. `import.meta.env.PUBLIC_ENV_NAME`)

### Docker Development

Backend runs in Docker with:

- Platform: linux/arm64 (required for IC system canisters on Apple Silicon)
- Local IC replica via the `icp-cli-network-launcher` image (`network` service), driven by `icp-cli`
- Automatic initialization via `scripts/bootstrap.mjs`
- Caddy reverse proxy on port 443 for HTTPS
- MinIO (`minio` / `minio-init`) providing S3-compatible external blob storage

### Canister Declarations

After modifying Motoko canisters:

1. Run `npx nx run backend:generate-declarations` to generate TypeScript types (via `icp-bindgen`; also emits init-args `.bin` files)
2. Declarations are written to `libs/declarations/src/<canister>/`
3. Import from `@rabbithole/declarations` (or the `/backend`, `/encrypted-storage` subpaths)

## Agent Skills

Skills are managed via the `skills` npm package (https://skills.sh). **Do not edit skill files manually and do not duplicate their descriptions in this file — `npx skills ls` is always more up-to-date.**

### Layout

- `.agents/skills/<name>/` — canonical content (real files); read directly by Codex, OpenCode, and other "universal" agents (their `skillsDir = ".agents/skills"` per the CLI source)
- `.claude/skills/<name>` → `../../.agents/skills/<name>` (symlink; Claude Code is the only agent in this project that needs its own dir)
- `skills-lock.json` — source + content hash for each managed skill

Agents used in this project: **Claude Code, Codex, OpenCode**. Do NOT install for Cursor / Gemini-CLI / others — they aren't used. (Even if they were, both are universal and would also read from `.agents/skills/`, so no extra dir needed.)

### Commands

```bash
npx skills ls                                                              # list installed
npx skills add dfinity/icskills --skill <name> -a universal -a claude-code -y    # install
npx skills update -p -y                                                    # update all project skills
npx skills remove -s <name> -a universal -a claude-code -y                 # remove
```

**Never use `--agent '*'`** — `add` accepts it and expands skills into ALL ~30 supported agents, creating `.adal/`, `.augment/`, `.bob/`, ... in the project root (and an OpenClaw `./skills/` folder without a leading dot). `remove`/`update` then no longer understand that wildcard. **Always pass `-a universal -a claude-code` explicitly** — `universal` covers Codex, OpenCode, and any future universal agent without creating extra dirs.

### Sources

- **dfinity/icskills** — IC platform: `asset-canister`, `canhelp`, `canister-security`, `certified-variables`, `ckbtc`, `custom-domains`, `cycles-management`, `evm-rpc`, `https-outcalls`, `ic-dashboard`, `icp-cli`, `icrc-ledger`, `internet-identity`, `motoko`, `multi-canister`, `stable-memory`, `vetkd`, `wallet-integration`. Mirror with current versions: `https://skills.internetcomputer.org/.well-known/skills/<name>/SKILL.md`. **Intentionally excluded:** `sns-launch`.
- **caffeinelabs/skills** — Caffeine extensions: `extension-authorization`, `extension-camera`, `extension-core-infrastructure`, `extension-email`, `extension-email-calendar-events`, `extension-email-marketing`, `extension-email-raw`, `extension-email-verification`, `extension-http-outcalls`, `extension-invite-links`, `extension-object-storage`, `extension-qr-code`, `extension-stripe`, `extension-user-approval`. React frontend hooks in these skills must be adapted to Angular patterns.
- **No source in lock file** (manually managed, `npx skills update` does not refresh them): `angular-developer`, `angular-cdk-integration`,  `angular-spartan-styling`, `rxjs-expert`, `rxjs-patterns-for-angular`, `frontend-design`, `scrollytelling`, `skill-creator`, `skill-lookup`, `excalidraw`.

## Testing Infrastructure

- **Unit Tests**: Vitest for most projects (configured per-project)
- **E2E Tests**: Playwright for end-to-end testing
- **Canister Tests**: @dfinity/pic for Motoko canister testing
- **Test Files**: Located alongside source files with `.spec.ts` extension

## Code Generation

Nx generator defaults (see `nx.json`): standalone Angular components, OnPush change detection, Vitest for unit tests, Playwright for E2E, ESLint.

## Dependencies

Key external dependencies:

- **@icp-sdk/\***: Current ICP SDK — `@icp-sdk/core` (agent/actor/principal), `@icp-sdk/auth`, `@icp-sdk/canisters`, `@icp-sdk/bindgen` (replaces the legacy `@dfinity/agent`/`@dfinity/auth-client`)
- **@dfinity/\***: Remaining DFINITY packages — `@dfinity/utils`, `@dfinity/vetkeys` (VetKD encryption), `@dfinity/pic` (canister tests)
- **@angular/\***: Angular 21 framework
- **@spartan-ng/brain**: UI component foundation
- **@tanstack/angular-\***: TanStack libraries (table, store)
- **@tauri-apps/\***: Tauri desktop app APIs
- **ngxtension**: Angular utility library with modern patterns
- **remeda**: Functional utility library (preferred over lodash)
- **ts-pattern**: Pattern matching for TypeScript

## Build Configuration

- **Build Tool**: Rspack (webpack alternative, faster)
- **Styling**: Tailwind CSS 4
- **Bundle Analysis**: Rsdoctor (use `RSDOCTOR=1` env var)
- **Compression**: Gzip and Brotli for production builds
- **Target**: ES2022, ESNext modules

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- You have access to the Nx MCP server and its tools, use them to help the user
- When answering questions about the repository, use the `nx_workspace` tool first to gain an understanding of the workspace architecture where applicable.
- When working in individual projects, use the `nx_project_details` mcp tool to analyze and understand the specific project structure and dependencies
- For questions around nx configuration, best practices or if you're unsure, use the `nx_docs` tool to get relevant, up-to-date docs. Always use this instead of assuming things about nx configuration
- If the user needs help with an Nx configuration or project graph error, use the `nx_workspace` tool to get any errors

<!-- nx configuration end-->

Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.
