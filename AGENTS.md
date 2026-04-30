# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.
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

## Project Overview

This is an Nx monorepo for a decentralized application built on the Internet Computer Protocol (ICP). The project combines Angular 20 frontend with Motoko smart contracts (canisters) for blockchain backend functionality. The main application is "Rabbithole" - a file storage and management system with encryption capabilities.

## Architecture

### Monorepo Structure

- **apps/rabbithole**: Main Angular 20 application (frontend)
- **apps/backend**: ICP/dfx backend with Motoko canisters (includes treasury as library)
- **apps/storage**: Storage-specific Angular application
- **apps/tauri-app**: Desktop application using Tauri
- **apps/\*-e2e**: E2E test projects using Playwright
- **libs/**: Shared libraries organized by domain
- **libs/motoko/**: Motoko canister libraries (shared Docker infrastructure)
- **infra/motoko-dev/**: Shared Dockerfile and entrypoint for all Motoko projects

### Key Libraries

- **libs/core**: Core services for IC management, file system access, WASM handling, and upload functionality
- **libs/auth**: Authentication services and guards for ICP identity management
- **libs/encrypted-storage**: Encrypted storage implementation and services
- **libs/declarations**: TypeScript declarations generated from Motoko canisters
- **libs/ui**: UI component library based on Spartan-ng (shadcn-like components for Angular)
- **libs/app-ui**: Application-specific UI components
- **libs/utils**: Utility functions
- **libs/shared**: Shared types and utilities

### Motoko Libraries (libs/motoko/)

- **libs/motoko/encrypted-storage**: Encrypted storage canister library (used by backend)
- **libs/motoko/treasury**: Treasury library (payments, fund distribution — used by backend as mixin)
- **libs/motoko/icpay-webhooks**: ICPay webhook handler library
- **libs/motoko/auth-jwt**: JWT authentication library

All Motoko libraries share a single Docker container (`libs/motoko/docker-compose.yml`) built from `infra/motoko-dev/Dockerfile`. Build/test commands run via `docker compose exec`.

### Backend (Internet Computer)

The backend runs on ICP using Motoko smart contracts (canisters):

- **rabbithole-backend**: Main backend canister (src/main.mo)
- **encrypted-storage**: Storage canister with encryption (src/EncryptedStorageCanister.mo)
- **internet-identity**: ICP authentication canister (external)
- **icp-ledger**: ICP token ledger (external)

Backend development uses Docker Compose with:

- Shared Dockerfile at `infra/motoko-dev/Dockerfile` (all Motoko projects)
- Shared entrypoint base at `infra/motoko-dev/entrypoint-base.sh`
- Caddy reverse proxy for HTTPS (backend only)
- DFX (DFINITY Canister SDK) for building and deploying canisters
- Mops package manager for Motoko dependencies

Docker containers:
- **apps/backend**: caddy + mock-server + backend replica (3 services)
- **libs/motoko**: single shared replica for all Motoko libraries (including treasury)

## Development Commands

### Starting Development

```bash
# Start main application (automatically starts backend and storage)
npm start
# or
npx nx serve rabbithole

# Start backend only (Docker Compose with DFX)
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

# Build backend (deploys canisters via Docker)
npx nx build backend

# Deploy backend canisters
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
npx nx run backend:generate-declarations

# Install CA certificate for local HTTPS
npx nx run backend:install-ca

# Run Docker Compose commands
npx nx compose backend -- <docker-compose-args>
```

### Nx Commands

```bash
# Show project graph
npx nx graph

# Show available targets for a project
npx nx show project <project-name>

# Run multiple targets across projects
npx nx run-many -t <target> -p <projects>

# Generate new library
npx nx g @nx/angular:lib <lib-name>

# Generate new component
npx nx g @nx/angular:component <component-name> --project=<project>
```

## Project-Specific Details

### Path Aliases

The project uses path aliases defined in tsconfig.base.json:

- `@rabbithole/core` → Core services
- `@rabbithole/auth` → Authentication
- `@rabbithole/ui` → UI components
- `@rabbithole/encrypted-storage` → Encrypted storage
- `@rabbithole/declarations` → Generated canister declarations
- `@spartan-ng/helm/*` → UI component library

### WebAssembly Configuration

The project uses WebAssembly modules (configured in rspack.config.ts):

- Async WASM support enabled
- Special handling for photon_rs_bg.wasm (image processing)
- WASM modules loaded via fetch

### Environment Variables

Backend environment variables from `apps/backend/.env` are automatically injected into the frontend build:

- Variables matching `/^(CANISTER_ID|DFX)_/` are included
- Access via `import.meta.env` in code

### Docker Development

Backend runs in Docker with:

- Platform: linux/arm64
- DFX canister SDK pre-installed
- Automatic initialization via scripts/install.sh
- Health check via `dfx ping`
- Caddy reverse proxy on port 443 for HTTPS

### Canister Declarations

After modifying Motoko canisters:

1. Run `npx nx run backend:generate-declarations` to generate TypeScript types
2. Declarations are copied to `libs/declarations/src/`
3. Import from `@rabbithole/declarations`

## Agent Skills

Skills are managed via the `skills` npm package (https://skills.sh). **Do not edit skill files manually and do not duplicate their descriptions in this file — `npx skills ls` is always more up-to-date.**

### Layout

- `.agents/skills/<name>/` — canonical content (real files); read directly by Codex, OpenCode, and other "universal" agents (their `skillsDir = ".agents/skills"` per the CLI source)
- `.Codex/skills/<name>` → `../../.agents/skills/<name>` (symlink; Codex is the only agent in this project that needs its own dir)
- `skills-lock.json` — source + content hash for each managed skill

Agents used in this project: **Codex, Codex, OpenCode**. Do NOT install for Cursor / Gemini-CLI / others — they aren't used. (Even if they were, both are universal and would also read from `.agents/skills/`, so no extra dir needed.)

### Commands

```bash
npx skills ls                                                              # list installed
npx skills add dfinity/icskills --skill <name> -a universal -a Codex -y    # install
npx skills update -p -y                                                    # update all project skills
npx skills remove -s <name> -a universal -a Codex -y                 # remove
```

**Never use `--agent '*'`** — `add` accepts it and expands skills into ALL ~30 supported agents, creating `.adal/`, `.augment/`, `.bob/`, ... in the project root (and an OpenClaw `./skills/` folder without a leading dot). `remove`/`update` then no longer understand that wildcard. **Always pass `-a universal -a Codex` explicitly** — `universal` covers Codex, OpenCode, and any future universal agent without creating extra dirs.

### Sources

- **dfinity/icskills** — IC platform: `asset-canister`, `canhelp`, `canister-security`, `certified-variables`, `ckbtc`, `custom-domains`, `cycles-management`, `evm-rpc`, `https-outcalls`, `ic-dashboard`, `icp-cli`, `icrc-ledger`, `internet-identity`, `motoko`, `multi-canister`, `stable-memory`, `vetkd`, `wallet-integration`. Mirror with current versions: `https://skills.internetcomputer.org/.well-known/skills/<name>/SKILL.md`. **Intentionally excluded:** `sns-launch`.
- **caffeinelabs/skills** — Caffeine extensions: `extension-authorization`, `extension-camera`, `extension-core-infrastructure`, `extension-email`, `extension-email-calendar-events`, `extension-email-marketing`, `extension-email-raw`, `extension-email-verification`, `extension-http-outcalls`, `extension-invite-links`, `extension-object-storage`, `extension-qr-code`, `extension-stripe`, `extension-user-approval`. React frontend hooks in these skills must be adapted to Angular patterns.
- **No source in lock file** (manually managed, `npx skills update` does not refresh them): `angular-developer`, `angular-cdk-integration`,  `angular-spartan-styling`, `rxjs-expert`, `rxjs-patterns-for-angular`, `frontend-design`, `scrollytelling`, `skill-creator`, `skill-lookup`, `excalidraw`.

### Groups by purpose

- **Angular (frontend)** — `angular-developer`, `angular-spartan-styling`, `angular-cdk-integration`
- **RxJS** — `rxjs-patterns-for-angular`, `rxjs-expert`
- **ICP backend** — all skills from dfinity/icskills (see above)
- **Caffeine extensions** — all skills from caffeinelabs/skills (see above)
- **Design / diagrams** — `frontend-design`, `scrollytelling`, `excalidraw`
- **Skill-meta** — `skill-creator`, `skill-lookup`

## Testing Infrastructure

- **Unit Tests**: Vitest for most projects (configured per-project)
- **E2E Tests**: Playwright for end-to-end testing
- **Canister Tests**: @dfinity/pic for Motoko canister testing
- **Test Files**: Located alongside source files with `.spec.ts` extension

## Code Generation

Nx generators are configured with defaults:

- All new Angular code uses standalone components
- Components default to OnPush change detection
- Vitest for unit tests
- Playwright for E2E tests
- ESLint for linting

## Dependencies

Key external dependencies:

- **@dfinity/\***: ICP SDK packages for identity, agents, and canister interaction
- **@angular/\***: Angular 20 framework
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
- **Target**: ES2015, ESNext modules

### Frontend Bundle Hygiene

Keep initial bundles small by preserving the existing lazy boundaries and narrow entrypoints.

- In app bootstrap, route files, guards, resolvers, and environment files, avoid importing from the broad `@rabbithole/core` barrel. Use focused entrypoints such as `@rabbithole/core/app-runtime`, `@rabbithole/core/storage-runtime`, `@rabbithole/core/wallet`, or direct local files when they already exist.
- Do not add exports to `@rabbithole/core/app-runtime` unless the symbol is truly needed during app startup. Storage/file upload, wallet, canister management, tables, dialogs, and visual feature components should stay behind lazy routes or feature-specific entrypoints.
- Avoid importing from local barrels in startup-sensitive files when the barrel re-exports heavy modules. Prefer direct imports like `./core/utils/custom-domain` over `./core/utils` if the barrel also exports actor creation, storage, upload, or worker code.
- Inside `libs/core`, avoid internal imports from broad sibling barrels such as `../services`, `../injectors`, `../tokens`, `../types`, or `../utils` in runtime-sensitive code. Import the concrete file instead to prevent unrelated services and schemas from entering `main`.
- Keep lightweight shared values separate from heavy validation/runtime files. For example, `UploadState` lives in `libs/core/src/lib/types/upload-state.ts`; do not move it back into `worker.ts`, because that pulls worker schemas and `arktype` into the initial bundle.
- New feature screens should be loaded through `loadComponent`/`loadChildren`. Use Angular `@defer` for non-critical widgets inside otherwise eager shells, such as toasts, optional panels, previews, charts, and developer/demo-only UI.
- Be careful with root providers (`providedIn: 'root'`, app-level `providers`, and app initializers). If a service touches large SDKs, upload/worker code, tables, charts, wallet code, or storage management, prefer route/component-level providers unless it must run before the first route.
- For dependency additions, check whether they affect `main` before merging. Prefer small, tree-shakeable APIs and avoid adding a dependency through a widely used shared barrel.
- After frontend bundle changes, run a production build for both apps and compare `main` and `Initial total`:
  `NX_DAEMON=false npx nx run-many -t build -p rabbithole storage --skip-nx-cache`
- For deeper analysis, run Rsdoctor and inspect duplicate packages and mixed chunks before changing chunking strategy:
  `NX_DAEMON=false RSDOCTOR=1 npx nx run-many -t build -p rabbithole storage --skip-nx-cache`

Current production budget baselines are intentionally close to measured output:

- `rabbithole`: initial warning at `1.15mb`, error at `1.6mb`.
- `storage`: initial warning at `1mb`, error at `1.4mb`.

If a legitimate feature needs more initial code, first try a lazy boundary or narrow import. Raise budgets only with a measured before/after explanation.

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
