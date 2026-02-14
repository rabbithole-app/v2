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

# install dependencies
echo "🔧 Initializing mops toolchain..."
mops toolchain init || echo "ℹ️ Mops toolchain already initialized."

# Source bashrc to apply toolchain changes
if [ -f ~/.bashrc ]; then
  source ~/.bashrc
fi

# install dependencies
mops install

# Apply mops patches (e.g. hex@1.0.2 Text.join argument order fix)
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
  echo "❌ dfx replica did not become ready in time"
  exit 1
}

if [ -z "${ICPAY_SECRET_KEY:-}" ]; then
  echo "❌ ICPAY_SECRET_KEY not set — cannot deploy"
  exit 1
fi

dfx deploy --network local example --argument "(blob \"${ICPAY_SECRET_KEY}\")"
dfx generate example

CANISTER_ID=$(dfx canister id example)
echo "✅ example canister deployed: $CANISTER_ID (secret configured)"

# Generate nginx config for reverse proxy (cloudflared → nginx → replica)
# nginx sets Host: localhost and appends canisterId so dfx replica routes to the correct canister
sed "s/\${CANISTER_ID}/${CANISTER_ID}/g" /app/nginx.conf.template > /nginx-config/default.conf
touch /nginx-config/.ready
echo "📝 nginx config generated for canister $CANISTER_ID"
echo "🔗 Waiting for cloudflared tunnel URL in 'docker compose logs cloudflared'..."

exec tail -f /dev/null
