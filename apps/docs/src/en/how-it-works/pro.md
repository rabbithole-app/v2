---
title: What Pro gives you
description: Which Rabbithole Pro features are added on top of the storage license
sidebar:
  order: 6
---

# What Pro gives you

Rabbithole Pro adds features to storage you already created: shared access,
storage updates, automatic cycle top-ups, and encrypted uploads without the base
license limits. These features run through Rabbithole, but they do not change
ownership: the storage remains your Internet Computer canister.

:::tip{title="Short version"}

The [storage license](/en/how-it-works/payment#storage-license-and-pro) gives
you base personal encrypted storage. Pro adds the parts Rabbithole operates for
you: shared access, updates, automatic cycle top-ups, and 2 TC of included cycle
balance per subscription period.

:::

## What Pro includes

These features are available while Pro is active.

| Feature | What changes |
|---|---|
| **Shared access** | You can share storages, folders, and files, manage permissions, handle access requests, and [invite by email](/en/how-it-works/sharing/email-invites) people who have not used Rabbithole yet. |
| **[Storage updates](/en/how-it-works/sovereignty/updates)** | After you approve the update, Rabbithole can install a new storage code version or storage web interface. |
| **Encrypted uploads without base limits** | Pro removes the base license limits for encrypted upload size and total encrypted storage. |
| **[Automatic cycle top-ups](/en/how-it-works/payment#how-automatic-cycle-top-ups-work)** | If a storage needs cycles before an operation or when its balance drops, Rabbithole can top up the canister automatically. |
| **2 TC included cycle balance** | Each Pro period includes up to 2 TC for automatic top-ups across your storage canisters. This limit is shared across your storages. |

## How automatic top-ups and 2 TC work together

Internet Computer canisters need
[cycles](/en/getting-started/concepts#cycles) to pay for compute, memory,
storage, and network operations. Pro enables automatic cycle top-ups for your
storages and includes up to **2 TC** per subscription period.

2 TC is not a separate canister and it is not tokens in your wallet. It is the
limit Rabbithole can spend on top-ups for your storage canisters during the
current Pro period. If you have several storages, the shared limit is spent on
the canisters that need cycles.

Automatic top-up usually runs before an expensive operation, for example before
a large [On-chain Storage](/en/how-it-works/storage/on-chain-storage) upload, or
when a canister approaches its safe cycle floor.

2 TC means 2 trillion cycles. On the Internet Computer, **1 TC = 1 XDR**. Any
USD estimate is only a reference value and changes with the XDR/USD rate.

If the included limit is already used up, Rabbithole can continue with paid
automatic top-ups from your balance. This only happens when you enable that
setting.

## What Pro does not change

Pro adds service features, but it does not make Rabbithole the storage owner.

- The storage remains an independent Internet Computer canister.
- You keep control of the canister.
- For an update, Rabbithole gets only the temporary access window you approve.
- Pro does not give Rabbithole a bypass path to files or encryption keys.
- Access rules and vetKey issuance are still checked inside the storage
  canister.
- You can top up the canister manually through IC tools even when Pro is
  not active.

## When Pro is not active

Without active Pro, you can still use the storage within the base license:
personal encrypted storage within the issued limits.

Until Pro is renewed, features that require Rabbithole are not available: shared
access, access management, updates through Rabbithole, encrypted uploads without
the base license limits, and automatic cycle top-ups. If the canister needs
cycles, you top it up manually.

## Related pages

- [Payment & Cycles](/en/how-it-works/payment)
- [Shared access](/en/how-it-works/sharing/)
- [Storage updates](/en/how-it-works/sovereignty/updates)
- [Storage](/en/how-it-works/storage/)
