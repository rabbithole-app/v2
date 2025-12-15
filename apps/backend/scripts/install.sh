#!/usr/bin/env bash
set -euo pipefail

cleanup() {
  # Best-effort shutdown
  dfx stop >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

# Cleanup old dfx local network state
echo "🧹 Cleaning up old DFX network state..."
rm -rf /app/.dfx/network/local/pid
rm -rf /app/.dfx/network/local/pocket-ic-pid

# create identity
echo "👤 Setting up minter identity..."
dfx identity new --storage-mode=plaintext minter || echo "ℹ️ Identity 'minter' already exists."
dfx identity use minter -q
MINTER_ACCOUNT_ID=$(dfx ledger account-id)

echo "👤 Setting up DFX identity..."
dfx identity new --storage-mode=plaintext docker-identity || echo "ℹ️ Identity 'docker-identity' already exists."
dfx identity use docker-identity -q
DEFAULT_ACCOUNT_ID=$(dfx ledger account-id)

# Restart local DFX network
echo "🚀 Starting DFX local network..."
dfx start --clean --background --host 0.0.0.0:4943 --domain localhost --domain 127.0.0.1 --domain 0.0.0.0

echo "⏳ Waiting for DFX to be ready..."
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

# install dependencies
mops install

echo "🚀 Deploying canisters..."
# Deploy all canisters except icp-ledger and cmc first
dfx deploy --network local internet-identity
dfx deploy --network local rabbithole-backend
dfx deploy --network local encrypted-storage
# dfx deploy --network local rabbithole-frontend

# Deploy ICP Ledger using dedicated script
bash scripts/deploy-ledger.sh

# Deploy CMC using dedicated script
bash scripts/deploy-cmc.sh

dfx generate || true

# Verify canisters are deployed
echo "✅ Verifying canisters are deployed..."
if [ -f .dfx/local/canister_ids.json ]; then
    echo "Canisters deployed:"
    cat .dfx/local/canister_ids.json | grep -o '"[^"]*":' | sed 's/"//g' | sed 's/://g' | head -5
fi

# keep waiting
exec tail -f /dev/null