# NNS State Snapshot Generator

Generates a clean NNS state snapshot for PocketIC tests.

## Usage

```bash
cd tools/nns-snapshot
docker compose up --build
```

Output:
- `output/nns_state/` — raw state directory
- `output/nns_state.tar.xz` — compressed archive

## Deploy to tests

```bash
cp output/nns_state.tar.xz ../../libs/testing/src/state/
cd ../../libs/testing/src/state/
rm -rf nns_state
tar -xJf nns_state.tar.xz
```
