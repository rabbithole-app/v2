# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

This project includes custom Agent Skills for Claude Code in `.claude/skills/`:

### angular-best-practices

Automatically applies modern Angular development standards:

**Core Patterns:**
- Standalone components (without explicit `standalone: true`)
- Signals for state management (`signal()`, `computed()`)
- `input()` and `output()` functions instead of decorators
- Native control flow: `@if`, `@for`, `@switch`
- `inject()` instead of constructor injection
- `ChangeDetectionStrategy.OnPush` always
- Native class/style bindings (no `ngClass`/`ngStyle`)

**Forms:**
- **Reactive Forms** - stable, proven approach
- **Signal Forms** (Angular 21+ - experimental) - schema-based validation with `form()` and `schema()`

The skill activates automatically when working with Angular code. Supports both stable and experimental Angular features.

### angular-component

Create modern Angular standalone components following v20+ best practices.

**Covers:**
- Signal-based inputs/outputs (`input()`, `output()`)
- OnPush change detection
- Host bindings via `host` object (not decorators)
- Content projection with `ng-content`
- Lifecycle hooks and `afterNextRender()`
- Accessibility requirements (ARIA, keyboard navigation)
- Template syntax (`@if`, `@for`, `@switch`)
- `NgOptimizedImage` for images

### angular-signals

Signal-based reactive state management in Angular v20+.

**Core APIs:**
- `signal()` - writable state
- `computed()` - derived state
- `linkedSignal()` - dependent state with reset
- `effect()` - side effects

**Patterns:**
- Component state management
- Service state with read-only signals
- RxJS interop (`toSignal()`, `toObservable()`)
- Signal equality and untracked reads

### angular-di

Dependency injection patterns for Angular v20+.

**Covers:**
- `inject()` function (preferred over constructor injection)
- Provider scopes (root, component, route)
- Injection tokens with factories
- Provider types (useClass, useValue, useFactory, useExisting)
- Multi providers for collections
- `APP_INITIALIZER` for async startup
- `runInInjectionContext()` for dynamic DI

### angular-directives

Custom directives for DOM manipulation and behavior extension.

**Types:**
- Attribute directives (modify element behavior/appearance)
- Structural directives (portals, overlays, lazy render)
- Host directives for composition

**Patterns:**
- Host property usage (not decorators)
- Event handling and keyboard shortcuts
- Directive Composition API

### angular-forms

Signal-based forms with Angular's Signal Forms API (experimental in v21+).

**Features:**
- Automatic two-way binding with `[formField]`
- Schema-based validation (`required`, `email`, `min`, `max`, etc.)
- Field state signals (valid, touched, dirty, errors)
- Conditional fields (hidden, disabled, readonly)
- Cross-field validation
- Async validation with `validateHttp()`
- Array/dynamic fields support

**Note:** For production stability, Reactive Forms patterns available in references.

### angular-http

HTTP data fetching with signals and HttpClient.

**APIs:**
- `httpResource()` - signal-based HTTP with automatic state
- `resource()` - generic async data loading
- `HttpClient` - traditional Observable approach

**Covers:**
- Request options and methods
- Functional interceptors
- Error handling patterns
- Loading states management

### angular-routing

Routing configuration for Angular v20+ applications.

**Features:**
- Lazy loading (`loadChildren`, `loadComponent`)
- Route parameters as signal inputs
- Functional guards (auth, role, canDeactivate)
- Resolvers for data prefetching
- Nested routes
- Programmatic navigation
- Router events

**Requires:** `withComponentInputBinding()` for signal inputs.

### angular-testing

Unit and integration testing for Angular v21+ with Vitest or Jasmine.

**Testing Targets:**
- Signal-based components
- OnPush change detection
- Services with `inject()`
- HTTP interactions

**Vitest Setup:**
- Faster than Jasmine/Karma
- `vi.fn()` and `vi.mock()` for mocking
- Built-in UI mode

**Patterns:**
- `fakeAsync`/`tick` for async
- `HttpTestingController` for HTTP
- Mock signal-based services

### angular-spartan-styling

Spartan UI components (Angular adaptation of shadcn/ui) with Tailwind CSS 4.

**Key Features:**
- **60+ accessible components** (directive-based)
- **Tailwind CSS 4** with @theme directive
- **`hlm()` utility** for class composition
- **Dark mode** support
- **Accessibility** built-in

**Angular-specific:**
- `<button hlmBtn>` instead of `<Button>`
- Imports from `@spartan-ng/helm/*`
- Signal-based reactivity
- Native Angular patterns

### angular-cdk-integration

Angular CDK integration patterns for advanced UI behavior.

**Covers:**
- Accessibility (a11y) features
- Layout utilities
- Overlay positioning
- Drag and drop
- Virtual scrolling
- Portal and overlay patterns

### rxjs-patterns-for-angular

RxJS patterns specifically tailored for Angular applications.

**Key Topics:**
- Observable patterns in Angular context
- State management with RxJS
- Error handling strategies
- Testing reactive code
- Performance optimization
- Common anti-patterns to avoid

### rxjs-expert

Advanced RxJS patterns and expert-level techniques.

**Covers:**
- Advanced operators
- Custom operators
- Backpressure handling
- Memory leak prevention
- Advanced composition patterns
- Performance optimization techniques

### frontend-design

Create distinctive, production-grade frontend interfaces with high design quality.

**Design Principles:**
- Bold aesthetic direction (minimalist, maximalist, retro-futuristic, etc.)
- Distinctive typography (avoid generic fonts like Inter, Arial)
- Cohesive color themes with CSS variables
- Motion and micro-interactions
- Unexpected layouts, asymmetry, grid-breaking

**Avoid:**
- Generic "AI slop" aesthetics
- Overused font families
- Cliched purple gradients
- Cookie-cutter design patterns

### scrollytelling

Scroll-driven storytelling and animations for web applications.

**Features:**
- Scroll-based animations
- Narrative-driven interfaces
- IntersectionObserver patterns
- Performance optimization for scroll effects
- Accessibility considerations

### skill-creator

Meta-skill for creating new Agent Skills following best practices.

**Guidelines:**
- Skill structure and organization
- Documentation standards
- Example formatting
- File size limits (main skill file ≤500 lines)
- Reference file organization
- Version control and updates

### skill-lookup

Utility skill for discovering and navigating available skills in the project.

**Features:**
- Skill discovery
- Quick reference to skill locations
- Capability overview
- Cross-skill navigation

### excalidraw

Create hand-drawn style diagrams using Excalidraw JSON format.

**Covers:**
- Architecture diagrams, flowcharts, sequence diagrams
- `.excalidraw` file generation
- Can be opened at excalidraw.com

### asset-canister

Deploy frontend assets to the IC with certified responses and SPA routing.

**Covers:**
- Certified assets with SPA routing via `.ic-assets.json5`
- Custom domain setup with DNS configuration
- Programmatic uploads with `@icp-sdk/canisters/assets`
- Content encoding (gzip/brotli) and caching strategies

### canister-security

IC-specific security patterns for Motoko and Rust canisters.

**Covers:**
- Anonymous principal rejection and access control guards
- CallerGuard pattern for per-caller reentrancy locking
- `inspect_message` for cycle optimization
- Callback trap handling and state rollback awareness
- Cycles monitoring and freezing threshold management

### certified-variables

Serve cryptographically verified query responses using Merkle trees and subnet BLS signatures.

**Covers:**
- RbTree/CertTree construction for Merkle proofs
- `certified_data_set` (updates) and `data_certificate` (queries)
- Witness generation and frontend verification
- HTTP certification for custom HTTP canisters

### ckbtc

Accept, send, and manage ckBTC tokens with BTC deposit/withdrawal flows.

**Covers:**
- BTC deposit flow via minter (get address → send BTC → update balance)
- ckBTC transfers and ICRC-2 approve/transferFrom
- BTC withdrawal (min 50,000 satoshis)
- Subaccount derivation and UTXO management

### cycles-management

Manage cycles and canister lifecycle including top-ups, freezing thresholds, and programmatic canister creation.

**Covers:**
- Cycle balance queries and acceptance patterns
- Canister creation via management canister
- Top-up operations and freezing threshold configuration
- Cycles ledger integration

### evm-rpc

Call Ethereum and EVM chains from IC canisters via the EVM RPC canister.

**Covers:**
- Multi-provider consensus with `Consistent`/`Inconsistent` variants
- ERC-20 token balance reads via `eth_call`
- Signed raw transaction submission
- Chain support: Ethereum, Arbitrum, Base, Optimism

### https-outcalls

Make HTTPS requests from canisters to external web APIs.

**Covers:**
- Transform functions for consensus (strip non-deterministic data)
- GET/POST with custom headers and idempotency keys
- Response size limits (2MB max) and cycle cost calculation
- Automatic cycle attachment

### icp-cli

Build and deploy IC applications using the `icp` CLI tool with YAML configuration.

**Covers:**
- YAML configuration (`icp.yaml`) with canister definitions
- Recipe system for Rust, Motoko, and asset canisters
- Environment-based deployment (local, staging, production)
- TypeScript binding generation with `@icp-sdk/bindgen`

### icrc-ledger

Deploy and interact with ICRC-1/ICRC-2 token ledgers (ICP, ckBTC, ckETH).

**Covers:**
- ICRC-1 transfers with deduplication
- ICRC-2 approve/transferFrom allowance mechanics
- Fee handling per token type
- Local test ledger deployment

### internet-identity

Integrate Internet Identity authentication with passkey and OpenID login flows.

**Covers:**
- Passkey and OpenID account support
- Delegation expiry configuration (max 30 days)
- Per-app principal isolation for privacy
- `AuthClient` for frontend login flow

### multi-canister

Design and deploy multi-canister dapps with inter-canister calls and factory patterns.

**Covers:**
- Inter-canister calls with bounded/unbounded wait semantics
- 2MB payload limit for requests and responses
- Canister factory pattern for dynamic creation
- Reentrancy prevention and callback trap handling

### stable-memory

Persist canister state across upgrades using StableBTreeMap (Rust) or persistent actor (Motoko).

**Covers:**
- Motoko: `persistent actor` with automatic stable storage
- Rust: `StableBTreeMap`, `StableCell`, `StableLog` with `MemoryManager`
- `transient` keyword for non-stable data
- Direct stable memory access without pre_upgrade serialization

### vetkd

Implement on-chain encryption using vetKeys (verifiable encrypted threshold key derivation).

**Covers:**
- `vetkd_public_key` and `vetkd_derive_key` APIs
- Transport keys for secure delivery
- IBE (Identity-Based Encryption) for principal-based encryption
- Context-based key isolation

### wallet-integration

Integrate wallets with IC dApps using ICRC signer standards (ICRC-21/25/27/29/49).

**Covers:**
- Popup-based signer model with JSON-RPC 2.0 over postMessage
- `IcpWallet` / `IcrcWallet` for ledger operations
- Permission lifecycle with consent messages
- Per-action transaction approval flow

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
