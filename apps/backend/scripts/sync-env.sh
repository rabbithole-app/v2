#!/usr/bin/env bash
set -euo pipefail

environment="${1:-${ICP_ENVIRONMENT:-local}}"
mainnet_ii_signer="rdmx6-jaaaa-aaaaa-aaadq-cai"

case "$environment" in
  local)
    trusted_attribute_signers="$(icp canister status internet_identity_backend -e local -i)"
    frontend_origins="http://localhost:4200"
    ;;
  staging)
    trusted_attribute_signers="$mainnet_ii_signer"
    frontend_canister_id="$(icp canister status rabbithole-frontend -e staging -i)"
    frontend_origins="https://${frontend_canister_id}.icp.net,https://${frontend_canister_id}.icp0.io"
    ;;
  ic)
    trusted_attribute_signers="$mainnet_ii_signer"
    frontend_canister_id="$(icp canister status rabbithole-frontend -e ic -i)"
    frontend_origins="https://rabbithole.app,https://${frontend_canister_id}.icp.net,https://${frontend_canister_id}.icp0.io"
    ;;
  *)
    echo "Usage: scripts/sync-env.sh [local|staging|ic]" >&2
    exit 2
    ;;
esac

icp canister settings update rabbithole-backend -e "$environment" \
  --add-environment-variable "trusted_attribute_signers=${trusted_attribute_signers}" \
  --add-environment-variable "frontend_origins=${frontend_origins}" \
  -f

echo "Synced rabbithole-backend env for ${environment}: trusted_attribute_signers, frontend_origins"
