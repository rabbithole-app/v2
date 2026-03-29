#!/usr/bin/env bash
# Entrypoint for the motoko-libs Docker container.
# Installs mops deps, starts DFX, builds all canisters.
# Tests run on the host, not inside Docker.
set -euo pipefail

export PATH="$(npm bin -g):${PATH}"

# Pick first library as working dir for entrypoint-base.sh
# (mops toolchain init is global, mops install runs per-cwd)
for lib in /workspace/libs/*/; do
  if [ -f "$lib/mops.toml" ]; then
    cd "$lib"
    break
  fi
done

# Common setup: mops toolchain, minter identity, DFX start
# Skip npm install — tests run on host, not in Docker
SKIP_NPM_INSTALL=1 source /infra/entrypoint-base.sh

# Install mops deps + patches for remaining libraries
for lib in /workspace/libs/*/; do
  if [ -f "$lib/mops.toml" ] && [ "$lib" != "$(pwd)/" ]; then
    echo "Installing mops deps for $(basename "$lib")..."
    (cd "$lib" && mops install && \
     if [ -x /mops-patches/apply.sh ]; then /mops-patches/apply.sh "$lib" || true; fi)
  fi
done

# Create canisters and build wasm for all libraries
for lib in /workspace/libs/*/; do
  if [ -f "$lib/dfx.json" ]; then
    echo "Building canisters for $(basename "$lib")..."
    (cd "$lib" && dfx canister create --all && dfx build)
  fi
done

echo "Motoko libs replica ready."
exec tail -f /dev/null
