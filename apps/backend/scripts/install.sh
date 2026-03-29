#!/usr/bin/env bash
set -euo pipefail

# Cleanup old dfx local network state
rm -rf /app/.dfx/network/local/pid
rm -rf /app/.dfx/network/local/pocket-ic-pid

# Common setup: minter identity, mops deps, DFX start
source /infra/entrypoint-base.sh

MINTER_ACCOUNT_ID=$(dfx ledger account-id)
echo "Minter account: $MINTER_ACCOUNT_ID"

# Deploy canisters
echo "Deploying canisters..."
dfx deploy --network local rabbithole-backend

BACKEND_ID=$(dfx canister id rabbithole-backend)
OWNER_PRINCIPAL=$(dfx identity get-principal)
dfx deploy --network local encrypted-storage --argument "(record { vetKeyName = \"dfx_test_key\"; owner = principal \"$OWNER_PRINCIPAL\"; backendId = principal \"$BACKEND_ID\" })"

dfx generate || true

# Verify canisters are deployed
echo "Verifying canisters are deployed..."
if [ -f .dfx/local/canister_ids.json ]; then
    echo "Canisters deployed:"
    cat .dfx/local/canister_ids.json | grep -o '"[^"]*":' | sed 's/"//g' | sed 's/://g' | head -5
fi

exec tail -f /dev/null
