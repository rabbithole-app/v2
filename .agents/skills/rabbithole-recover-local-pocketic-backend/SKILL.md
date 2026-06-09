---
name: rabbithole-recover-local-pocketic-backend
description: Restore the Rabbithole local apps/backend ICP/PocketIC environment when local canisters, mappings, or the local frontend/backend gateway stop working.
---

# Recover local Rabbithole backend

Use this skill when the user asks to restore local Rabbithole canisters,
storage, or the frontend/backend environment.

## Recovery

Prefer the repo command:

```bash
npx nx run backend:reset-local
```

That command is expected to recreate local state, bootstrap required canisters,
generate declarations, deploy local canisters, and sync local backend
environment variables.

If the command fails partway through, resume only the missing pieces instead of
rerunning unrelated steps. Inspect the current local mapping first:

```bash
sed -n '1,180p' apps/backend/.icp/data/mappings/local.ids.json
```

A complete local mapping includes:

- `xrc`
- `evm_rpc`
- `sol_rpc`
- `internet_identity_backend`
- `internet_identity_frontend`
- `rabbithole-backend`
- `rabbithole-frontend`

Deploy missing groups from `apps/backend`:

```bash
icp deploy xrc evm_rpc sol_rpc -e local
icp deploy internet_identity_backend internet_identity_frontend -e local
icp deploy rabbithole-backend rabbithole-frontend -e local
bash scripts/sync-env.sh local
```

Only add `--cycles` when `icp` reports that creation needs cycles. Keep cycle
top-ups small for ordinary app canisters. System/helper canisters may need a
larger initial funding amount on a fresh local network.

## Required checks

Do not report recovery as complete until these checks pass.

1. Docker services are up:

   ```bash
   docker compose -f apps/backend/docker-compose.yml ps
   ```

2. The frontend build passes:

   ```bash
   npx nx build rabbithole --skip-nx-cache
   ```

3. Required canisters are visible and running:

   ```bash
   icp canister status rabbithole-backend -e local
   icp canister status rabbithole-frontend -e local
   icp canister status internet_identity_backend -e local
   icp canister status internet_identity_frontend -e local
   icp canister status xrc -e local
   icp canister status evm_rpc -e local
   icp canister status sol_rpc -e local
   ```

4. The current frontend canister serves the app. Read the current
   `rabbithole-frontend` ID from `local.ids.json`:

   ```bash
   curl -I --max-time 10 http://<rabbithole-frontend>.localhost:8000/
   curl -k -I --max-time 10 https://<rabbithole-frontend>.localhost/
   ```

5. The backend responds:

   ```bash
   icp canister call -e local rabbithole-backend getStorageReleaseAdminStatus '()' --output candid
   ```

## Common failures

- `docker compose ps` can be healthy while the gateway or canister mapping is
  broken. Verify with `icp canister status` and frontend `curl` checks.
- If `local.ids.json` is missing app canisters, deploy the missing groups and
  run `bash scripts/sync-env.sh local`.
- If the frontend canister returns `404`, check that
  `dist/apps/rabbithole/browser` is populated, rebuild `rabbithole`, and
  redeploy `rabbithole-frontend`.
- If `icp deploy` cannot fetch prebuilt Wasm, retry the affected canister deploy
  after confirming network/cache access.
