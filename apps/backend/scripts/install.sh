#!/usr/bin/env bash
set -euo pipefail

# Cleanup old dfx local network state
rm -rf /app/.dfx/network/local/pid
rm -rf /app/.dfx/network/local/pocket-ic-pid

# Common setup: minter identity, mops deps, DFX start
source /infra/entrypoint-base.sh

MINTER_ACCOUNT_ID=$(dfx ledger account-id)
echo "Minter account: $MINTER_ACCOUNT_ID"

# Deploy system canisters referenced by mainnet IDs (hardcoded in main.mo / chain configs).
# All three live on fiduciary subnet on mainnet, so we create local copies there.
ensure_canister_with_id() {
  local name="$1"
  local want_id="$2"
  if ! dfx canister --network local id "$name" 2>/dev/null | grep -q "$want_id"; then
    if dfx canister --network local id "$name" >/dev/null 2>&1; then
      echo "Existing $name has wrong ID — recreating..."
      dfx canister --network local stop "$name" >/dev/null 2>&1 || true
      dfx canister --network local delete "$name" --no-withdrawal -y >/dev/null 2>&1 || true
    fi
    dfx canister --network local create "$name" --specified-id "$want_id" --subnet-type fiduciary \
      || echo "WARNING: $name create with specified-id failed."
  fi
}

echo "Creating XRC/sol_rpc/evm_rpc with mainnet IDs..."
ensure_canister_with_id xrc     uf6dk-hyaaa-aaaaq-qaaaq-cai
ensure_canister_with_id sol_rpc tghme-zyaaa-aaaar-qarca-cai
ensure_canister_with_id evm_rpc 7hfb6-caaaa-aaaar-qadga-cai

echo "Installing wasm for xrc/sol_rpc/evm_rpc..."
dfx deploy --network local xrc     --no-wallet || echo "WARNING: XRC deploy failed."
dfx deploy --network local sol_rpc --no-wallet || echo "WARNING: sol_rpc deploy failed."
dfx deploy --network local evm_rpc --no-wallet || echo "WARNING: evm_rpc deploy failed."

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
