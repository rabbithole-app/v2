#!/bin/bash
# Apply mops patches to fix dependency compatibility issues.
# This is needed because hex@1.0.2 uses old mo:core API (Text.join argument order changed).
#
# Usage:
#   /path/to/mops-patches/apply.sh [target-dir]
#
# target-dir: directory containing .mops/ (defaults to current directory)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${1:-.}"

cd "$TARGET_DIR"

echo "Applying mops patches in $(pwd)..."

for patch_file in "$SCRIPT_DIR"/*.patch; do
  if [ -f "$patch_file" ]; then
    patch_name=$(basename "$patch_file")

    # Extract first target file from patch to check if dependency exists
    first_target=$(grep "^--- a/" "$patch_file" | head -1 | sed 's|^--- a/||')
    if [ -n "$first_target" ] && [ ! -f "$first_target" ]; then
      echo "  $patch_name: target not found ($first_target), skipping"
      continue
    fi

    echo "  Applying: $patch_name"

    # Try to apply patch, skip if already applied
    if patch -p1 --dry-run < "$patch_file" > /dev/null 2>&1; then
      patch -p1 < "$patch_file"
      echo "    Applied successfully"
    elif patch -p1 -R --dry-run < "$patch_file" > /dev/null 2>&1; then
      echo "    Already applied, skipping"
    else
      echo "    Failed to apply patch"
      exit 1
    fi
  fi
done

echo "Mops patches done."
