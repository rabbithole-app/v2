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

# create minter identity
if (dfx identity list | grep minter 2>&1 >/dev/null) ; then
    echo "ℹ️ Identity minter already exists" >&2
else
    dfx identity import minter --storage-mode plaintext <(cat <<EOF
-----BEGIN EC PRIVATE KEY-----
MHQCAQEEICJxApEbuZznKFpV+VKACRK30i6+7u5Z13/DOl18cIC+oAcGBSuBBAAK
oUQDQgAEPas6Iag4TUx+Uop+3NhE6s3FlayFtbwdhRVjvOar0kPTfE/N8N6btRnd
74ly5xXEBNSXiENyxhEuzOZrIWMCNQ==
-----END EC PRIVATE KEY-----
EOF
    )
fi

# echo "👤 Setting up DFX identity..."
# dfx identity new --storage-mode=plaintext docker-identity || echo "ℹ️ Identity 'docker-identity' already exists."
# dfx identity use docker-identity -q
# DEFAULT_ACCOUNT_ID=$(dfx ledger account-id)

dfx identity use minter -q
MINTER_ACCOUNT_ID=$(dfx ledger account-id)
echo "📋 Minter account: $MINTER_ACCOUNT_ID"

# Restart local DFX network
echo "🚀 Starting DFX local network..."
dfx start --system-canisters --clean --background --host 0.0.0.0:4943 --domain localhost --domain 127.0.0.1 --domain 0.0.0.0

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
echo "🔧 Initializing mops toolchain..."
mops toolchain init || echo "ℹ️ Mops toolchain already initialized."

# Source bashrc to apply toolchain changes
if [ -f ~/.bashrc ]; then
  source ~/.bashrc
fi

# install dependencies
mops install

echo "🚀 Deploying canisters..."
dfx deploy --network local rabbithole-backend
dfx deploy --network local encrypted-storage
# dfx deploy --network local rabbithole-frontend

dfx generate || true

# Verify canisters are deployed
echo "✅ Verifying canisters are deployed..."
if [ -f .dfx/local/canister_ids.json ]; then
    echo "Canisters deployed:"
    cat .dfx/local/canister_ids.json | grep -o '"[^"]*":' | sed 's/"//g' | sed 's/://g' | head -5
fi

# keep waiting
exec tail -f /dev/null