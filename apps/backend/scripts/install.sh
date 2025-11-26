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
dfx stop || true
dfx start --clean --host 0.0.0.0:4943 &> /app/replica.log
echo "⏳ Waiting for DFX to be ready..."
sleep 10

# install dependencies
mops install

echo "🚀 Deploying canisters..."
# Deploy all canisters except icp-ledger first
dfx deploy --network local internet-identity
dfx deploy --network local rabbithole-backend
dfx deploy --network local encrypted-storage
dfx deploy --network local rabbithole-frontend

# Deploy icp-ledger with proper init arguments using environment variables
echo "🚀 Deploying ICP Ledger with minter: $MINTER_ACCOUNT_ID and default: $DEFAULT_ACCOUNT_ID"
dfx deploy --network local --specified-id ryjl3-tyaaa-aaaaa-aaaba-cai icp-ledger --argument "(variant { Init = record { minting_account = \"$MINTER_ACCOUNT_ID\"; initial_values = vec { record { \"$DEFAULT_ACCOUNT_ID\"; record { e8s = 10_000_000_000 : nat64; }; }; }; send_whitelist = vec {}; transfer_fee = opt record { e8s = 10_000 : nat64; }; token_symbol = opt \"LICP\"; token_name = opt \"Local ICP\"; } })"

dfx generate

# Verify canisters are deployed
echo "✅ Verifying canisters are deployed..."
if [ -f .dfx/local/canister_ids.json ]; then
    echo "Canisters deployed:"
    cat .dfx/local/canister_ids.json | grep -o '"[^"]*":' | sed 's/"//g' | sed 's/://g' | head -5
fi

# keep waiting
tail -f /app/replica.log