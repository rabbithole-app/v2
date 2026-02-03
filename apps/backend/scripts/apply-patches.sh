#!/bin/bash
# Script to apply patches to mops dependencies after running `mops install`
# This is needed because hex@1.0.2 uses old mo:core API (Text.join argument order)
#
# Usage:
#   cd apps/backend
#   mops install
#   ./scripts/apply-patches.sh
#
# Or run from project root:
#   cd apps/backend && mops install && ./scripts/apply-patches.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
PATCHES_DIR="$BACKEND_DIR/patches"

cd "$BACKEND_DIR"

if [ ! -d "$PATCHES_DIR" ]; then
  echo "No patches directory found at $PATCHES_DIR"
  exit 0
fi

echo "Applying mops patches..."

for patch_file in "$PATCHES_DIR"/*.patch; do
  if [ -f "$patch_file" ]; then
    patch_name=$(basename "$patch_file")
    echo "  Applying: $patch_name"

    # Try to apply patch, skip if already applied
    if patch -p1 --dry-run < "$patch_file" > /dev/null 2>&1; then
      patch -p1 < "$patch_file"
      echo "    ✅ Applied successfully"
    elif patch -p1 -R --dry-run < "$patch_file" > /dev/null 2>&1; then
      echo "    ⏭️  Already applied, skipping"
    else
      echo "    ❌ Failed to apply patch"
      exit 1
    fi
  fi
done

echo "Done!"
