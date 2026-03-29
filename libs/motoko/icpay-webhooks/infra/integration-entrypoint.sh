#!/usr/bin/env bash
# Integration entrypoint for icpay-webhooks.
# Self-contained — does NOT use entrypoint-base.sh to avoid
# minter identity and system canisters side effects.
set -euo pipefail

cleanup() {
  dfx stop >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

corepack enable >/dev/null 2>&1 || true
export PATH="$(npm bin -g):${PATH}"

echo "Initializing mops toolchain..."
mops toolchain init || echo "Mops toolchain already initialized."
if [ -f ~/.bashrc ]; then source ~/.bashrc; fi

mops install

if [ -x /mops-patches/apply.sh ]; then
  /mops-patches/apply.sh /app || true
fi

dfx start --clean --background --host 0.0.0.0:4943 --domain localhost --domain 127.0.0.1 --domain 0.0.0.0

echo "Waiting for DFX to be ready..."
for _ in $(seq 1 60); do
  if dfx ping >/dev/null 2>&1; then break; fi
  sleep 1
done
dfx ping >/dev/null 2>&1 || { echo "dfx replica did not become ready in time"; exit 1; }

if [ -z "${ICPAY_SECRET_KEY:-}" ]; then
  echo "ICPAY_SECRET_KEY not set — cannot deploy"
  exit 1
fi

dfx deploy --network local example --argument "(blob \"${ICPAY_SECRET_KEY}\")"
dfx generate example

CANISTER_ID=$(dfx canister id example)
echo "example canister deployed: $CANISTER_ID (secret configured)"

sed "s/\${CANISTER_ID}/${CANISTER_ID}/g" /app/infra/nginx.conf.template > /nginx-config/default.conf
touch /nginx-config/.ready
echo "nginx config generated for canister $CANISTER_ID"
echo "Waiting for cloudflared tunnel URL in 'docker compose logs cloudflared'..."

exec tail -f /dev/null
