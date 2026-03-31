#!/usr/bin/env bash
set -euo pipefail

# Cleanup old dfx local network state
rm -rf /app/.dfx/network/local/pid
rm -rf /app/.dfx/network/local/pocket-ic-pid

# Common setup: minter identity, mops deps, DFX start
source /infra/entrypoint-base.sh

MINTER_ACCOUNT_ID=$(dfx ledger account-id)
echo "Minter account: $MINTER_ACCOUNT_ID"

# Deploy canisters (non-fatal — container stays alive for manual builds)
echo "Deploying canisters..."
if ! dfx deploy --network local rabbithole-backend; then
  echo "WARNING: Backend deploy failed (compilation error?). Container stays alive for manual builds."
fi

if BACKEND_ID=$(dfx canister id rabbithole-backend 2>/dev/null); then
  OWNER_PRINCIPAL=$(dfx identity get-principal)
  dfx deploy --network local encrypted-storage --argument "(record { vetKeyName = \"dfx_test_key\"; owner = principal \"$OWNER_PRINCIPAL\"; backendId = principal \"$BACKEND_ID\" })" || echo "WARNING: encrypted-storage deploy failed."
  dfx generate || true
else
  echo "WARNING: Backend not deployed, skipping encrypted-storage and generate."
fi

# Verify canisters are deployed
echo "Verifying canisters are deployed..."
if [ -f .dfx/local/canister_ids.json ]; then
    echo "Canisters deployed:"
    cat .dfx/local/canister_ids.json | grep -o '"[^"]*":' | sed 's/"//g' | sed 's/://g' | head -5
fi

exec tail -f /dev/null
