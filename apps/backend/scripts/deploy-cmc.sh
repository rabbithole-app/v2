#!/bin/bash
set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Navigate to backend directory (parent of scripts)
cd "$SCRIPT_DIR/.."

echo "🚀 Deploying CMC (Cycles Management Canister)..."

# Check if CMC canister is configured in dfx.json
if ! grep -q '"cmc"' dfx.json; then
  echo "⚠️  CMC canister not found in dfx.json. Skipping deployment."
  exit 0
fi

# Get ICP Ledger canister ID (must be deployed first)
LEDGER_CANISTER_ID=$(dfx canister id icp-ledger --network local 2>/dev/null || echo "")

if [ -z "$LEDGER_CANISTER_ID" ]; then
  echo "❌ ICP Ledger not found. CMC requires ICP Ledger to be deployed first."
  echo "   Please deploy ICP Ledger before deploying CMC."
  exit 1
fi

echo "📋 Using ICP Ledger ID: $LEDGER_CANISTER_ID"

# Get minter account ID for minting_account_id
dfx identity use minter -q 2>/dev/null || {
  echo "⚠️  Minter identity not found. Creating..."
  dfx identity new --storage-mode=plaintext minter || echo "ℹ️ Identity 'minter' already exists."
  dfx identity use minter -q
}
MINTER_ACCOUNT_ID=$(dfx ledger account-id)

echo "📋 Using minter account: $MINTER_ACCOUNT_ID"

# Deploy CMC with init arguments
# CMC init args: opt CyclesCanisterInitPayload - init function expects opt wrapper
# governance_canister_id is required (IC Management Canister: aaaaa-aa)
dfx deploy --network local cmc --argument "(opt record { ledger_canister_id = opt principal \"$LEDGER_CANISTER_ID\"; governance_canister_id = opt principal \"aaaaa-aa\"; minting_account_id = opt \"$MINTER_ACCOUNT_ID\"; last_purged_notification = null : opt nat64; exchange_rate_canister = null : opt variant { Set : principal; Unset }; cycles_ledger_canister_id = null : opt principal; })"

echo "✅ CMC deployed successfully"
dfx canister id cmc --network local

