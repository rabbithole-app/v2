---
title: FAQ
description: Frequently asked questions about Rabbithole
---

## Data Sovereignty

These answers explain who controls your storage and what remains under your
control outside the Rabbithole interface.

### Who controls my storage canister?
In the completed flow, you do. Rabbithole is a temporary controller during setup
or an approved update so it can install or retry the deployment, then removes
itself during handoff. See [Data Sovereignty](/en/how-it-works/sovereignty) for
details.

### Can I use my own frontend?
Yes. Your canister serves its own frontend, which you can replace. The canister
API is public — you can interact with it through
[Candid](https://internetcomputer.org/docs/building-apps/interact/candid/candid-concepts).

### What happens to my data if I stop paying?
With On-chain Storage, your data remains in your canister while the canister
stays funded with cycles. With Blob Storage, your canister keeps the file record
and verification data, but blob availability depends on the Blob Storage funding
and retention lifecycle. You can top up cycles directly without going through
Rabbithole.

## General

These answers cover the basic product model and everyday usage limits.

### What is Rabbithole?
A decentralized file storage app built on the Internet Computer, designed around
end-to-end encryption and personal canister ownership.

### How much does it cost?
You pay a fixed setup price to create your storage. This covers canister
creation, the initial cycles balance, deployment operations, and the
infrastructure needed to complete the handoff. See
[Data Sovereignty](/en/how-it-works/sovereignty) for details.

### What file types are supported?
All file types. Rabbithole stores binary file data, so the file format does not
matter.

### Is there a file size limit?
Rabbithole does not set a separate hard file-size limit. Files are split into
fragments automatically; in practice, file size depends on the selected storage
mode, funded resources, your browser, and connection quality.

## Security

These answers summarize the confidentiality and recovery model.

### Can the Rabbithole team read my files?
No. Rabbithole's code and product interface do not include a mechanism that
gives the team separate access to user files.

In encrypted mode, your browser encrypts the file before upload, so Rabbithole
does not receive plaintext data. If you store a file without encryption, the
canister and selected storage mode handle plaintext bytes. That is no longer a
zero-knowledge mode, but it does not give the Rabbithole team an admin path to
your files.

### What happens if I lose my device?
You can recover access through Internet Identity's device recovery mechanism. In
encrypted mode, your encryption keys are derived from your identity, not stored
on any specific device.

### Has Rabbithole been audited?
The code is open source and available for community review. Formal audits are planned.

### What encryption does Rabbithole use?
AES-GCM with per-fragment encryption. Keys are derived through ICP's vetKeys
threshold cryptography. See [Encryption](/en/how-it-works/encryption) for
details.

## Technical

These answers cover development, self-deployment, and direct canister access.

### Where can I learn the basic Internet Computer terms?
The [Core concepts](/en/getting-started/concepts) page explains the Internet
Computer, canisters, principals, Internet Identity, controllers, and cycles in
the Rabbithole context.

### Can I self-host Rabbithole?
Yes. The code is [open source](https://github.com/rabbithole-app/v2). You can deploy your own canisters and frontend.

### Can I build my own client?
Yes. The canister API is public. You can build any client that communicates with the canisters via Candid.
