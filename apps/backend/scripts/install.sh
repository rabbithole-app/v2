. $HOME/.local/share/dfx/env

# create identity
dfx identity new --storage-mode=plaintext docker-identity
dfx identity use docker-identity -q

# start replica
dfx start --clean &> /app/replica.log

# pull and setup internet identity canister in local
dfx deps pull
dfx deps init --argument '(null)' internet-identity

# install dependencies
# npm ci --no-audit
mops install

# deploy canisters in local
dfx deps deploy
dfx deploy rabbithole-frontend
dfx deploy rabbithole-backend

# generate declarations
dfx generate

# keep waiting
tail -f /app/replica.log
