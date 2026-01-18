# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Nx monorepo for a decentralized application built on the Internet Computer Protocol (ICP). The project combines Angular 20 frontend with Motoko smart contracts (canisters) for blockchain backend functionality. The main application is "Rabbithole" - a file storage and management system with encryption capabilities.

## Architecture

### Monorepo Structure

- **apps/rabbithole**: Main Angular 20 application (frontend)
- **apps/backend**: ICP/dfx backend with Motoko canisters
- **apps/storage**: Storage-specific Angular application
- **apps/tauri-app**: Desktop application using Tauri
- **apps/\*-e2e**: E2E test projects using Playwright
- **libs/**: Shared libraries organized by domain

### Key Libraries

- **libs/core**: Core services for IC management, file system access, WASM handling, and upload functionality
- **libs/auth**: Authentication services and guards for ICP identity management
- **libs/encrypted-storage**: Encrypted storage implementation and services
- **libs/declarations**: TypeScript declarations generated from Motoko canisters
- **libs/ui**: UI component library based on Spartan-ng (shadcn-like components for Angular)
- **libs/app-ui**: Application-specific UI components
- **libs/utils**: Utility functions
- **libs/shared**: Shared types and utilities

### Backend (Internet Computer)

The backend runs on ICP using Motoko smart contracts (canisters):

- **rabbithole-backend**: Main backend canister (src/main.mo)
- **encrypted-storage**: Storage canister with encryption (src/EncryptedStorageCanister.mo)
- **internet-identity**: ICP authentication canister (external)
- **icp-ledger**: ICP token ledger (external)

Backend development uses Docker Compose with:

- Caddy reverse proxy for HTTPS
- DFX (DFINITY Canister SDK) for building and deploying canisters
- Mops package manager for Motoko dependencies

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

**Includes:**
- Comprehensive documentation
- 120+ code examples
- Detailed guides on components, signals, templates, Reactive Forms, and Signal Forms
- Migration patterns between approaches
- Best practices for both form types

The skill activates automatically when working with Angular code. Supports both stable and experimental Angular features.

### angular-spartan-styling

Comprehensive skill for creating beautiful, accessible UIs in Angular using Spartan UI components (Angular adaptation of shadcn/ui), Tailwind CSS 4, and modern Angular patterns.

**Key Features:**
- **Spartan UI Components**: 60+ accessible components (directive-based)
- **Tailwind CSS 4**: Utility-first styling with @theme directive
- **hlm utility**: Class composition (equivalent to shadcn's cn)
- **Component catalog**: Complete reference with Angular usage patterns
- **Responsive design**: Mobile-first patterns with Tailwind
- **Dark mode**: Built-in theme support
- **Accessibility**: ARIA patterns and keyboard navigation
- **Visual design**: Canvas-based design system philosophy

**Differences from React/shadcn:**
- Uses `hlm()` instead of `cn()`
- Directive-based: `<button hlmBtn>` instead of `<Button>`
- Imports from `@spartan-ng/helm/*`
- Signal-based reactivity instead of React hooks
- Native Angular patterns (@if, @for, computed)

**Resources:**
- Main skill file with quick start and navigation
- Component reference (spartan-components.md)
- Tailwind utilities, responsive, and customization guides
- Canvas design system for visual compositions

### angular-cdk-integration

Angular CDK integration patterns and best practices for advanced UI behavior.

**Covers:**
- Accessibility features
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
