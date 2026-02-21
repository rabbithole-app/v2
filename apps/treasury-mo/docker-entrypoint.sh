#!/usr/bin/env bash
set -euo pipefail

cleanup() {
  dfx stop >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

corepack enable >/dev/null 2>&1 || true

# Symlink monorepo root artifacts so that ../../ from /app resolves correctly.
# vitest's tsconfigPaths and tsconfig "extends" use ../../tsconfig.base.json,
# and @rabbithole/* path aliases point to ../../libs/*.
if [ -d /workspace ]; then
  ln -sfn /workspace/tsconfig.base.json /tsconfig.base.json 2>/dev/null || true
  ln -sfn /workspace/libs /libs 2>/dev/null || true
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is missing in the container image; can't install deps/mops."
  exit 127
fi

npm ci || npm install

# Make sure global npm binaries (mops) are on PATH even with nvm-y setups
export PATH="$(npm bin -g):${PATH}"

echo "Initializing mops toolchain..."
mops toolchain init || echo "Mops toolchain already initialized."

if [ -f ~/.bashrc ]; then
  source ~/.bashrc
fi

mops install

# Apply mops patches
if [ -x /mops-patches/apply.sh ]; then
  /mops-patches/apply.sh /app || true
fi

dfx start --clean --background --host 0.0.0.0:4943 --domain localhost --domain 127.0.0.1 --domain 0.0.0.0

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

ADMIN="${TREASURY_ADMIN:-aaaaa-aa}"
dfx deploy --network local treasury --argument "(record { admin = principal \"${ADMIN}\" })"
dfx generate treasury

CANISTER_ID=$(dfx canister id treasury)
echo "treasury canister deployed: $CANISTER_ID (admin: $ADMIN)"

exec tail -f /dev/null
