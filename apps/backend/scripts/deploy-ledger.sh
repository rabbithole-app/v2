#!/bin/bash
set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Navigate to backend directory (parent of scripts)
cd "$SCRIPT_DIR/.."

echo "🚀 Deploying ICP Ledger..."

# Get minter account ID
dfx identity use minter -q 2>/dev/null || {
  echo "⚠️  Minter identity not found. Creating..."
  dfx identity new --storage-mode=plaintext minter || echo "ℹ️ Identity 'minter' already exists."
  dfx identity use minter -q
}
MINTER_ACCOUNT_ID=$(dfx ledger account-id)

# Get default account ID
dfx identity use docker-identity -q 2>/dev/null || {
  echo "⚠️  Docker identity not found. Creating..."
  dfx identity new --storage-mode=plaintext docker-identity || echo "ℹ️ Identity 'docker-identity' already exists."
  dfx identity use docker-identity -q
}
DEFAULT_ACCOUNT_ID=$(dfx ledger account-id)

echo "📋 Minter account: $MINTER_ACCOUNT_ID"
echo "📋 Default account: $DEFAULT_ACCOUNT_ID"

# Deploy icp-ledger with proper init arguments
dfx deploy --network local icp-ledger --argument "(variant { Init = record { minting_account = \"$MINTER_ACCOUNT_ID\"; initial_values = vec { record { \"$DEFAULT_ACCOUNT_ID\"; record { e8s = 10_000_000_000 : nat64; }; }; }; send_whitelist = vec {}; transfer_fee = opt record { e8s = 10_000 : nat64; }; token_symbol = opt \"LICP\"; token_name = opt \"Local ICP\"; } })"

echo "✅ ICP Ledger deployed successfully"
dfx canister id icp-ledger --network local

