#!/usr/bin/env bash
set -euo pipefail

cleanup() {
  # Best-effort shutdown
  dfx stop >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

corepack enable >/dev/null 2>&1 || true

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ npm is missing in the container image; can't install deps/mops."
  exit 127
fi

npm ci || npm install

# Make sure global npm binaries (mops) are on PATH even with nvm-y setups
export PATH="$(npm bin -g):${PATH}"

command -v mops >/dev/null 2>&1 || {
  echo "❌ mops not found in PATH. Rebuild the image."
  echo "PATH=${PATH}"
  exit 127
}

mops install

dfx start --clean --background --host 0.0.0.0:4943 --domain localhost --domain 127.0.0.1 --domain 0.0.0.0

for _ in $(seq 1 60); do
  if dfx ping >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
dfx ping >/dev/null 2>&1 || {
  echo "❌ dfx replica did not become ready in time"
  exit 1
}

dfx deploy --network local encrypted-storage
dfx generate encrypted-storage

echo "✅ encrypted-storage deployed"

exec tail -f /dev/null
