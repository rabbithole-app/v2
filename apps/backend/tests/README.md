# PIC.js Testing Guide

This directory contains tests for the frontend-installer-mo project using [PIC.js](https://js.icp.build/pic-js/) (PocketIC JavaScript SDK).

## ⚠️ CRITICAL: Direct Ledger Calls Don't Work!

**IMPORTANT**: You **CANNOT** call ICP Ledger methods directly from JavaScript tests. Calls will hang indefinitely.

```typescript
// ❌ DON'T DO THIS - Will hang forever!
const balance = await icpLedgerActor.account_balance({
  account: principalToSubAccount(Principal.anonymous()),
});
```

**Solution**: Create a proxy canister that calls Ledger, then test through your canister. See [README-IMPORTANT.md](./README-IMPORTANT.md) for details.

## Overview

PocketIC is a lightweight, deterministic testing solution for ICP canisters that simulates mainnet behavior locally.

## Files

- **`pic-ledger-example.test.ts`** - Examples of working with ICP Ledger using PIC.js
- **`storage-deployer.test.ts`** - Tests for the storage-deployer canister with ICP Ledger integration
- **`frontend-installer.test.ts`** - Tests for the frontend installer canister

## Key Concepts

### Pre-installed System Canisters

When you use `IcpFeaturesConfig.DefaultConfig`, PocketIC automatically installs the **ICP Ledger** canister at the standard canister ID:

```typescript
const pic = await PocketIc.create(inject('PIC_URL'), {
  icpFeatures: {
    icpToken: IcpFeaturesConfig.DefaultConfig,  // ← Ledger pre-installed!
  },
});
```

**Standard Canister IDs:**
- **ICP Ledger**: `ryjl3-tyaaa-aaaaa-aaaba-cai`
- **Cycles Minting Canister (CMC)**: `rkp4c-7iaaa-aaaaa-aaaca-cai`

### ⚠️ Common Pitfall: CanisterAlreadyInstalled Error

**DON'T** try to install the Ledger again with `setupCanister`:

```typescript
// ❌ WRONG - This will cause "CanisterAlreadyInstalled" error!
const ledgerFixture = await pic.setupCanister({
  wasm: LEDGER_WASM_PATH,
  targetCanisterId: Principal.fromText('ryjl3-tyaaa-aaaaa-aaaba-cai'),
  // ...
});
```

**DO** create an actor for the pre-installed Ledger:

```typescript
// ✅ CORRECT - Use the pre-installed Ledger
const icpLedgerActor = pic.createActor<IcpLedgerActorService>(
  icpLedgerIdlFactory as unknown as IDL.InterfaceFactory,
  ICP_LEDGER_CANISTER_ID,
);

icpLedgerActor.setIdentity(ownerIdentity);
```

## Working with ICP Ledger

### Basic Setup

```typescript
import {
  createIdentity,
  IcpFeaturesConfig,
  PocketIc,
} from '@dfinity/pic';
import { principalToSubAccount } from '@dfinity/utils';
import { Principal } from '@icp-sdk/core/principal';
import type { IDL } from '@icp-sdk/core/candid';

import {
  idlFactory as icpLedgerIdlFactory,
  type _SERVICE as IcpLedgerActorService,
} from '../declarations/icp-ledger/icp-ledger.did';

const ICP_LEDGER_CANISTER_ID = Principal.fromText('ryjl3-tyaaa-aaaaa-aaaba-cai');
const ownerIdentity = createIdentity('owner');

async function createPic() {
  const pic = await PocketIc.create(inject('PIC_URL'), {
    icpFeatures: {
      icpToken: IcpFeaturesConfig.DefaultConfig,
    },
  });

  const icpLedgerActor = pic.createActor<IcpLedgerActorService>(
    icpLedgerIdlFactory as unknown as IDL.InterfaceFactory,
    ICP_LEDGER_CANISTER_ID,
  );

  icpLedgerActor.setIdentity(ownerIdentity);

  return { pic, icpLedgerActor };
}
```

### Initial Balances

PocketIC automatically sets **1 billion ICP** (1,000,000,000 ICP) as the initial balance for the **anonymous principal**:

```typescript
const E8S_PER_ICP = 100_000_000;

const balance = await icpLedgerActor.account_balance({
  account: principalToSubAccount(Principal.anonymous()),
});

// balance = 1_000_000_000 * 100_000_000 = 100000000000000000n (in e8s)
```

### Transferring ICP

```typescript
const recipientIdentity = createIdentity('recipient');
const recipientPrincipal = recipientIdentity.getPrincipal();

// Transfer 10 ICP
const transferAmount = BigInt(10) * BigInt(E8S_PER_ICP);

const result = await icpLedgerActor.transfer({
  to: principalToSubAccount(recipientPrincipal),
  fee: { e8s: BigInt(10_000) }, // 0.0001 ICP fee
  memo: BigInt(0),
  from_subaccount: [],
  created_at_time: [],
  amount: { e8s: transferAmount },
});

if ('Ok' in result) {
  console.log('Transfer successful!', result.Ok);
} else {
  console.error('Transfer failed:', result.Err);
}
```

### Checking Balances

```typescript
const balance = await icpLedgerActor.account_balance({
  account: principalToSubAccount(recipientPrincipal),
});

console.log(`Balance: ${balance / BigInt(E8S_PER_ICP)} ICP`);
```

## Working with Cycles Minting Canister (CMC)

Unlike the Ledger, the CMC is **NOT** pre-installed. You must install it manually.

### Setup

```typescript
import { idlFactory as cmcIdlFactory } from '@icp-sdk/canisters/declarations/cmc/cmc';
import type { _SERVICE as CmcService } from '@icp-sdk/canisters/declarations/cmc/cmc';

const CMC_CANISTER_ID = Principal.fromText('rkp4c-7iaaa-aaaaa-aaaca-cai');
const CMC_WASM_PATH = resolve(
  import.meta.dirname,
  '..',
  'canisters',
  'cmc',
  'cycles-minting-canister-custom.wasm',
);

async function createPicWithCmc() {
  const pic = await PocketIc.create(inject('PIC_URL'), {
    icpFeatures: {
      icpToken: IcpFeaturesConfig.DefaultConfig,  // Ledger pre-installed
    },
  });

  // Install CMC manually
  const cmcFixture = await pic.setupCanister<CmcService>({
    idlFactory: cmcIdlFactory as unknown as IDL.InterfaceFactory,
    wasm: CMC_WASM_PATH,
    sender: ownerIdentity.getPrincipal(),
    targetCanisterId: CMC_CANISTER_ID,
  });

  return { pic, cmcFixture };
}
```

### Using CMC

```typescript
test('should get ICP/XDR conversion rate from CMC', async () => {
  const { pic, cmcFixture } = await createPicWithCmc();
  const cmcActor = cmcFixture.actor;
  cmcActor.setIdentity(ownerIdentity);

  const rate = await cmcActor.get_icp_xdr_conversion_rate();
  expect(rate.data.xdr_permyriad_per_icp).toBeGreaterThan(0n);

  await pic.tearDown();
});
```

## Running Tests

### Via Docker (Recommended)

```bash
cd apps/frontend-installer-mo
docker compose exec replica npx vitest run tests/pic-ledger-example.test.ts
```

### Locally

```bash
npx nx test frontend-installer-mo
```

## Best Practices

1. **Always use `IcpFeaturesConfig.DefaultConfig`** for automatic Ledger setup
2. **Use standard canister IDs** for mainnet compatibility
3. **Create actors** for pre-installed canisters, don't reinstall them
4. **Clean up** with `pic.tearDown()` in `afterEach`
5. **Set time** with `pic.setCertifiedTime()` for deterministic tests
6. **Use identities** to test different users: `createIdentity('name')`

## Troubleshooting

### Error: CanisterAlreadyInstalled

**Problem**: Trying to install Ledger when it's already pre-installed.

**Solution**: Use `pic.createActor()` instead of `pic.setupCanister()` for Ledger.

### Error: ENOENT - WASM file not found

**Problem**: WASM file doesn't exist.

**Solution**: Build the canister first:
```bash
npx nx build frontend-installer-mo
```

### Tests timeout

**Problem**: PocketIC server not running or tests taking too long.

**Solution**:
- Ensure Docker is running
- Increase test timeout: `test('...', { timeout: 60000 }, async () => {...})`
- Check PocketIC server logs

## Resources

- [PIC.js Documentation](https://js.icp.build/pic-js/latest)
- [ICP SDK Canisters](https://github.com/dfinity/icp-js-canisters)
- [PocketIC Documentation](https://docs.internetcomputer.org/building-apps/test/pocket-ic)
- [NNS Canisters Wiki](https://wiki.internetcomputer.org/wiki/NNS_Canisters)
- [ICP Ledger Documentation](https://internetcomputer.org/docs/tutorials/developer-journey/level-4/4.1-icp-ledger)
