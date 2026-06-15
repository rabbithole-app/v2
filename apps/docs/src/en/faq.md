---
title: FAQ
description: Frequently asked questions about Rabbithole
---

## Data Sovereignty

These answers cover storage ownership: who controls the canister and what stays
under your control outside the Rabbithole interface.

### Who controls my storage canister?
In the completed flow, you do. Rabbithole is a temporary controller during setup
or an approved update so it can install or retry the deployment, then removes
itself during handoff. See [Data Sovereignty](/how-it-works/sovereignty/index) for
details.

### Can I use my own frontend?
Yes. Your canister serves its own frontend, which you can replace. The canister
API is public — you can interact with it through
[Candid](https://internetcomputer.org/docs/building-apps/interact/candid/candid-concepts).

### What happens to my data if I stop paying?
With On-chain Storage, your data remains in your canister while it has cycles.
With Blob Storage, your canister keeps the file record and verification data,
but blob availability depends on Blob Storage funding and retention. You can top
up cycles directly without going through Rabbithole.

If Pro expires, your vault falls back to the Starter Vault limits issued during
vault creation. The owner keeps personal encrypted storage within those
limits, but automatic cycle top-ups and sharing require active Pro.

## General

These are short answers about the product model and everyday limits.

### What is Rabbithole?
Rabbithole is a sovereign encrypted vault on the Internet Computer. It is
designed around browser-side encryption, personal canister ownership, and
service features that help you operate the vault without giving Rabbithole a
master key.

### How much does it cost?
You pay a fixed setup price to create a Starter Vault. This covers canister
creation, the initial cycles balance, deployment operations, and the
infrastructure needed to complete the handoff. Starter Vault includes personal
encrypted storage within issued starter limits.

Rabbithole Pro adds capabilities on top of that baseline: uploads beyond
starter limits while Pro is active, sharing, automatic cycle top-ups, and 2 TC
of managed operations credit. See
[What Rabbithole Pro gives you](/how-it-works/pro) for details.

### What file types are supported?
All file types. Rabbithole stores binary file data, so the file format does not
matter.

### Is there a file size limit?
For encrypted uploads, the limit depends on Starter Vault limits or active Pro.
Starter Vault defines starter encrypted storage and the maximum file
size. Active Pro lets uploads continue beyond those starter limits while
managed credit or your balance can fund the operation.

Rabbithole does not add a separate technical file-size limit. Upload and
encryption work in fragments, so the browser does not need to keep the whole
file in memory when working with large files. Practical limits are still
possible: with On-chain Storage, the file is written into the canister, and
large uploads can run into limits of the subnet where the user's canister is
deployed, as well as the cycle balance.

### Why does upload sometimes show Waiting for cycles?
This is an On-chain Storage upload waiting for a safe cycle buffer. If the owner
has active Pro, Rabbithole can top up the canister and continue the same
upload session. Without Pro, the owner needs to top up the canister
manually.

## Security

These answers summarize the confidentiality and recovery model.

### Can the Rabbithole team read my files?
No. Rabbithole's code and product interface do not include a mechanism that
gives the team separate access to user files.

Your browser encrypts the file before upload, so Rabbithole does not receive
plaintext data. The canister keeps access rules and trusted records, while file
bytes follow the selected storage mode already encrypted.

### What happens if I lose my device?
You can recover access through Internet Identity's device recovery mechanism.
Your encryption keys are derived from your identity, not stored on any specific
device.

### Has Rabbithole been audited?
The code is open source and available for community review. Formal audits are planned.

### What encryption does Rabbithole use?
AES-GCM with per-fragment encryption. Keys are derived through ICP's vetKeys
threshold cryptography. See [Encryption](/how-it-works/encryption/index) for
details.

## Technical

These answers cover development, self-deployment, and direct canister access.

### Where can I learn the basic Internet Computer terms?
The [Core concepts](/getting-started/concepts) page explains the Internet
Computer, canisters, principals, Internet Identity, controllers, and cycles in
the Rabbithole context.

### Can I self-host Rabbithole?
Yes. The code is [open source](https://github.com/rabbithole-app/v2). You can deploy your own canisters and frontend.

### Can I build my own client?
Yes. The canister API is public. You can build any client that communicates with the canisters via Candid.
