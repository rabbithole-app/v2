#!/usr/bin/env bash
# Shared entrypoint base for all Motoko projects.
# Source this script from project-specific entrypoints:
#   source /infra/entrypoint-base.sh
#
# After sourcing, DFX replica is running and mops deps are installed.
# The caller should then deploy canisters and keep the container alive.

set -euo pipefail

cleanup() {
  dfx stop >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

# Node.js setup
corepack enable >/dev/null 2>&1 || true

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is missing in the container image; can't install deps/mops."
  exit 127
fi

# Install project npm dependencies (vitest, etc.)
# Skip with SKIP_NPM_INSTALL=1 when tests run on host (e.g. motoko-libs)
if [ -f package.json ] && [ "${SKIP_NPM_INSTALL:-}" != "1" ]; then
  npm ci || npm install
fi

# Ensure global npm binaries (mops) are on PATH
export PATH="$(npm bin -g):${PATH}"

# Mops toolchain + dependencies
echo "Initializing mops toolchain..."
mops toolchain init || echo "Mops toolchain already initialized."

if [ -f ~/.bashrc ]; then
  source ~/.bashrc
fi

mops install

# Apply mops patches
if [ -x /mops-patches/apply.sh ]; then
  /mops-patches/apply.sh "$(pwd)" || true
fi

# Setup minter identity for system canisters (ledger minting account)
if ! dfx identity list 2>/dev/null | grep -q minter; then
  dfx identity import minter --storage-mode plaintext <(cat <<'MINTER_KEY'
-----BEGIN EC PRIVATE KEY-----
MHQCAQEEICJxApEbuZznKFpV+VKACRK30i6+7u5Z13/DOl18cIC+oAcGBSuBBAAK
oUQDQgAEPas6Iag4TUx+Uop+3NhE6s3FlayFtbwdhRVjvOar0kPTfE/N8N6btRnd
74ly5xXEBNSXiENyxhEuzOZrIWMCNQ==
-----END EC PRIVATE KEY-----
MINTER_KEY
  )
fi
dfx identity use minter -q

# Start DFX replica with system canisters
dfx start --system-canisters --clean --background --host 0.0.0.0:4943 \
  --domain localhost --domain 127.0.0.1 --domain 0.0.0.0

echo "Waiting for DFX to be ready..."
for _ in $(seq 1 60); do
  if dfx ping >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
dfx ping >/dev/null 2>&1 || {
  echo "dfx replica did not become ready in time"
  exit 1
}

echo "DFX replica ready."
