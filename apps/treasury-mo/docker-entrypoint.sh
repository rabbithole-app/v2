#!/usr/bin/env bash
set -euo pipefail

# Symlink monorepo root artifacts so that ../../ from /app resolves correctly.
# vitest's tsconfigPaths and tsconfig "extends" use ../../tsconfig.base.json,
# and @rabbithole/* path aliases point to ../../libs/*.
if [ -d /workspace ]; then
  ln -sfn /workspace/tsconfig.base.json /tsconfig.base.json 2>/dev/null || true
  ln -sfn /workspace/libs /libs 2>/dev/null || true
fi

# Common setup: mops deps + DFX start
source /infra/entrypoint-base.sh

# Deploy all canisters (treasury + remote evm_rpc/sol_rpc)
dfx deploy --network local
dfx generate

CANISTER_ID=$(dfx canister id treasury)
echo "treasury canister deployed: $CANISTER_ID"

exec tail -f /dev/null
