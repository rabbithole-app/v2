# Cleanup old dfx local network state
echo "🧹 Cleaning up old DFX network state..."
rm -rf /app/.dfx/network/local/pid
rm -rf /app/.dfx/network/local/pocket-ic-pid

# create identity
echo "👤 Setting up DFX identity..."
dfx identity new --storage-mode=plaintext docker-identity || echo "ℹ️ Identity 'docker-identity' already exists."
dfx identity use docker-identity -q

# Restart local DFX network
echo "🚀 Starting DFX local network..."
dfx stop || true
dfx start --clean --host 0.0.0.0:4943 &> /app/replica.log
echo "⏳ Waiting for DFX to be ready..."
sleep 10

# install dependencies
mops install

echo "🚀 Deploying canisters..."
dfx deploy rabbithole-backend --network local
dfx deploy encrypted-storage --network local
dfx deploy internet-identity --network local
dfx canister create rabbithole-frontend --network local
dfx generate

# Verify canisters are deployed
echo "✅ Verifying canisters are deployed..."
if [ -f .dfx/local/canister_ids.json ]; then
    echo "Canisters deployed:"
    cat .dfx/local/canister_ids.json | grep -o '"[^"]*":' | sed 's/"//g' | sed 's/://g' | head -5
fi

# keep waiting
tail -f /app/replica.log