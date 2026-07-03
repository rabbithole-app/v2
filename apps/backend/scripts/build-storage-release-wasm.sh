#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$BACKEND_DIR/../.." && pwd)"
ICP_YAML="$BACKEND_DIR/icp.yaml"
ICP_YAML_BACKUP="$(mktemp)"
STORAGE_MAIN="src/EncryptedStorageCanister.mo"
STORAGE_MOC_ARGS=(--max-stable-pages 3276800)
ARTIFACTS_DIR="$REPO_ROOT/release-artifacts"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --artifacts-dir)
      if [ "${2:-}" = "" ]; then
        echo "Missing value for --artifacts-dir" >&2
        exit 1
      fi
      if [[ "$2" = /* ]]; then
        ARTIFACTS_DIR="$2"
      else
        ARTIFACTS_DIR="$PWD/$2"
      fi
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

cp "$ICP_YAML" "$ICP_YAML_BACKUP"

cleanup() {
  cp "$ICP_YAML_BACKUP" "$ICP_YAML"
  rm -f "$ICP_YAML_BACKUP"
}
trap cleanup EXIT

cd "$BACKEND_DIR"

cat > icp.yaml <<'YAML'
environments:
  - name: build
    network: local
    canisters:
      - encrypted-storage

canisters:
  - name: encrypted-storage
    recipe:
      type: '@dfinity/motoko@v4.1.0'
      configuration:
        main: src/EncryptedStorageCanister.mo
        args: --max-stable-pages 3276800
        compress: true
YAML

if ! mops install --lock check; then
  echo "mops lock check failed; rebuilding generated .mops cache before applying local patches" >&2
  rm -rf "$BACKEND_DIR/.mops"
  mops install --lock check
fi
../../mops-patches/apply.sh .
icp build -e build encrypted-storage

mkdir -p "$ARTIFACTS_DIR"
cp "$BACKEND_DIR/.icp/cache/artifacts/encrypted-storage" "$ARTIFACTS_DIR/encrypted-storage.wasm.gz"

MOC="$(mops toolchain bin moc)"
MOC_SOURCES=($(mops sources))

"$MOC" --idl "${MOC_SOURCES[@]}" -o "$ARTIFACTS_DIR/encrypted-storage.did" "$STORAGE_MAIN"
"$MOC" --stable-types "${MOC_SOURCES[@]}" "${STORAGE_MOC_ARGS[@]}" -o "$ARTIFACTS_DIR/encrypted-storage.most" "$STORAGE_MAIN"
