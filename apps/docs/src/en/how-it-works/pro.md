---
title: What Rabbithole Pro gives you
description: Which Rabbithole Pro features are added on top of Starter Vault
---

# What Rabbithole Pro gives you

Rabbithole Pro adds features on top of vaults you already created: sharing,
updates, automatic cycle top-ups, and encrypted uploads beyond Starter Vault
limits.

Pro does not create a new vault. Your vaults remain under your control: each
one runs as a separate Internet Computer canister.

:::tip{title="Short version"}

[Starter Vault](/how-it-works/payment#starter-vault-and-rabbithole-pro)
gives you personal encrypted storage within issued starter limits. Rabbithole
Pro adds the parts Rabbithole operates for you: sharing, updates, automatic
cycle top-ups, and 2 TC of managed operations credit per subscription period.

:::

## What the Pro subscription includes

These features are available across your vaults while Rabbithole Pro is active.

| Feature | What changes |
|---|---|
| **Sharing** | You can share vaults, folders, and files, manage permissions, handle access requests, and [invite by email](/how-it-works/sharing/email-invites) people who have not used Rabbithole yet. |
| **[Storage updates](/how-it-works/sovereignty/updates)** | After you approve the update, Rabbithole can install a new storage code version or storage web interface. |
| **[Own S3 storage](/how-it-works/storage/own-s3-storage)** | On a Blob Storage vault, you can connect your own S3-compatible bucket to hold the encrypted bytes and pay your provider directly, instead of the default blob-storage service. |
| **Uploads beyond starter limits** | Rabbithole Pro lets encrypted uploads continue beyond Starter Vault limits while the subscription is active and the operation can be funded by managed credit or your balance. |
| **[Automatic cycle top-ups](/how-it-works/payment#how-automatic-cycle-top-ups-work)** | If a storage canister needs cycles before an operation or when its balance drops, Rabbithole can top it up automatically. |
| **2 TC managed operations credit** | Each Pro period includes up to 2 TC for automatic top-ups. The limit is shared across your vaults: Rabbithole spends it on the canisters that need cycles. |

## How automatic top-ups and 2 TC work together

Each vault runs as a separate Internet Computer canister. That canister needs
[cycles](/getting-started/concepts#cycles) to pay for compute, memory, storage,
and network operations. Pro enables automatic cycle top-ups and includes up to
**2 TC** of managed operations credit per subscription period.

2 TC is not a separate vault and it is not tokens in your wallet. It is the
limit Rabbithole can spend on automatic top-ups during the current Pro period.
If you have several vaults, the shared limit is spent on the canisters that
need cycles.

Automatic top-up usually runs before an expensive operation, for example before
a large [On-chain Storage](/how-it-works/storage/on-chain-storage) upload, or
when a storage canister approaches its safe cycle floor.

2 TC means 2 trillion cycles. On the Internet Computer, **1 TC = 1 XDR**. Any
USD estimate is only a reference value and changes with the XDR/USD rate.

If the included credit is already used, Rabbithole can continue with paid
automatic top-ups from your balance. This only happens when you enable that
setting. If paid top-up is off or your balance cannot fund the operation, the
paid operation pauses until you top up manually or a new included-credit period
starts.

## What Pro does not change

Rabbithole Pro adds service features, but it does not create a vault and does
not make Rabbithole the vault owner.

- The vault remains an independent Internet Computer canister.
- You keep control of the canister.
- For an update, Rabbithole gets only the temporary access window you approve.
- Pro does not give Rabbithole a bypass path to files or encryption keys.
- Access rules and vetKey issuance are still checked inside the storage
  canister.
- You can top up the canister manually through IC tools even when Pro is not
  active.

## When Pro is not active

Without an active Pro subscription, you can still use the vault within the
Starter Vault limits: personal encrypted storage within the issued limits.

Until the subscription is renewed, features that require Rabbithole Pro are not
available: sharing, access management, updates through Rabbithole, uploads
beyond starter limits, and automatic cycle top-ups. If the canister needs
cycles, you top it up manually.

## Related pages

- [Payment & Cycles](/how-it-works/payment)
- [Shared access](/how-it-works/sharing/index)
- [Storage updates](/how-it-works/sovereignty/updates)
- [Storage](/how-it-works/storage/index)
