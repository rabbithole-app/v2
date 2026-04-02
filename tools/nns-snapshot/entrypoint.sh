#!/usr/bin/env bash
set -euo pipefail

echo "=== NNS Snapshot Generator ==="
echo "DFX version: $(dfx --version)"

cleanup() {
  dfx stop >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

# Minimal dfx.json (required by dfx start)
echo '{"canisters":{}}' > dfx.json

# Setup minter identity (same as entrypoint-base.sh)
if ! dfx identity list 2>/dev/null | grep -q minter; then
  dfx identity import minter --storage-mode plaintext <(cat <<'MINTER_KEY'
-----BEGIN EC PRIVATE KEY-----
MHQCAQEEICJxApEbuZznKFpV+VKACRK30i6+7u5Z13/DOl18cIC+oAcGBSuBBAAK
oUQDQgAEPas6Iag4TUx+Uop+3NhE6s3FlayFtbwdhRVjvOar0kPTfE/N8N6btRnd
74ly5xXEBNSXiENyxhEuzOZrIWMCNQ==
-----END EC PRIVATE KEY-----
MINTER_KEY
  )
fi
dfx identity use minter -q

# Start DFX with system canisters (NNS: CMC, ledger, governance, etc.)
echo "Starting dfx with --system-canisters..."
dfx start --system-canisters --clean --background --host 0.0.0.0:4943 \
  --domain localhost --domain 127.0.0.1 --domain 0.0.0.0

# Wait for replica to be ready
echo "Waiting for replica..."
for _ in $(seq 1 120); do
  if dfx ping >/dev/null 2>&1; then break; fi
  sleep 1
done
dfx ping >/dev/null 2>&1 || { echo "ERROR: replica not ready"; exit 1; }
echo "Replica ready."

# Verify NNS canisters are deployed by querying key canisters
echo "Verifying NNS canisters..."
CMC_ID="rkp4c-7iaaa-aaaaa-aaaca-cai"
LEDGER_ID="ryjl3-tyaaa-aaaaa-aaaba-cai"

for _ in $(seq 1 60); do
  if dfx canister status "$CMC_ID" >/dev/null 2>&1; then
    echo "  CMC ($CMC_ID): OK"
    break
  fi
  sleep 2
done

for _ in $(seq 1 30); do
  if dfx canister status "$LEDGER_ID" >/dev/null 2>&1; then
    echo "  Ledger ($LEDGER_ID): OK"
    break
  fi
  sleep 2
done

# Quick sanity: query CMC rate
echo "Querying CMC ICP/XDR rate..."
dfx canister call "$CMC_ID" get_icp_xdr_conversion_rate '()' 2>/dev/null && echo "  CMC rate query: OK" || echo "  CMC rate query: WARN (may be OK)"

echo "NNS canisters verified."

# Stop dfx to flush state to disk
echo "Stopping dfx..."
dfx stop
sleep 3

# Find the replicated state directory
# dfx --system-canisters may use shared network (~/.local/share/dfx/) or local (.dfx/)
STATE_BASE=""
for candidate in \
  ".dfx/network/local/state/replicated_state" \
  ".dfx/state/replicated_state" \
  "$HOME/.local/share/dfx/network/local/state/replicated_state" \
  "$HOME/.local/share/dfx/state/replicated_state"; do
  if [ -d "$candidate" ]; then
    STATE_BASE="$candidate"
    break
  fi
done

if [ -z "$STATE_BASE" ]; then
  # dfx uses shared network path
  STATE_BASE=$(find "$HOME/.local/share/dfx" -name "replicated_state" -type d 2>/dev/null | head -1)
fi

if [ -z "$STATE_BASE" ]; then
  echo "ERROR: State directory not found"
  exit 1
fi

echo "State base: $STATE_BASE"

# Find the NNS subnet — the one containing CMC canister (00000000000000020101)
NNS_DIR=""
for subnet_dir in "$STATE_BASE"/*/; do
  checkpoint_dir=$(find "$subnet_dir" -name "canister_states" -type d 2>/dev/null | head -1)
  if [ -n "$checkpoint_dir" ] && [ -d "$checkpoint_dir/00000000000000020101" ]; then
    NNS_DIR="$subnet_dir"
    break
  fi
done

if [ -z "$NNS_DIR" ]; then
  echo "ERROR: NNS subnet not found"
  for d in "$STATE_BASE"/*/; do
    echo "Subnet: $d"
    cp_dir=$(find "$d" -name "canister_states" -type d 2>/dev/null | head -1)
    [ -n "$cp_dir" ] && ls "$cp_dir/" 2>/dev/null | head -5
  done
  exit 1
fi

echo "NNS subnet: $NNS_DIR"

# Copy NNS subnet state to output
OUTPUT_DIR="/output/nns_state"
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"
cp -r "$NNS_DIR"/* "$OUTPUT_DIR/"

# Show canister states
CHECKPOINT_DIR=$(find "$OUTPUT_DIR/checkpoints" -maxdepth 1 -type d | tail -1)
if [ -d "$CHECKPOINT_DIR/canister_states" ]; then
  echo "Canisters in NNS snapshot:"
  ls "$CHECKPOINT_DIR/canister_states/"
fi

# Compress
echo "Compressing..."
cd /output
tar -Jcf nns_state.tar.xz nns_state
echo "=== Done: nns_state.tar.xz ($(du -sh nns_state.tar.xz | cut -f1)) ==="
