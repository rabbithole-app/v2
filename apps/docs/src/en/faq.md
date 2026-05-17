---
title: FAQ
description: Frequently asked questions about Rabbithole
---

## Data Sovereignty

These answers explain who controls your storage and what remains under your
control outside the Rabbithole interface.

### Who controls my storage canister?
Only you. After deployment, Rabbithole removes itself from the controller list. You are the sole controller of your canister. See [Data Sovereignty](/en/how-it-works/sovereignty) for details.

### Can I use my own frontend?
Yes. Your canister serves its own frontend, which you can replace. The canister API is public — you can interact with it via [Candid](https://internetcomputer.org/docs/building-apps/interact/candid/candid-concepts).

### What happens to my data if I stop paying?
With On-chain Storage, your data remains in your canister while the canister
stays funded with cycles. With Blob Storage, your canister keeps the file record
and verification data, but blob availability depends on the Blob Storage funding
and retention lifecycle. You can top up cycles directly without going through
Rabbithole.

## General

These answers cover the basic product model and everyday usage limits.

### What is Rabbithole?
A decentralized file storage app built on the Internet Computer, designed around end-to-end encryption and personal canister ownership.

### How much does it cost?
You pay a fixed price to create your storage. This covers canister creation and an initial balance of compute cycles. Rabbithole does not profit from this — the entire payment goes to the Internet Computer network. See [Data Sovereignty](/en/how-it-works/sovereignty) for details.

### What file types are supported?
All file types. Rabbithole stores binary file data — the file format does not matter.

### Is there a file size limit?
Individual files can be up to hundreds of megabytes. Files are split into fragments automatically.

## Security

These answers summarize the confidentiality and recovery model.

### Can the Rabbithole team read my files?
Not when encryption is enabled. In that mode, files are encrypted in your browser before upload. Without encryption, access rules still apply, but the full confidentiality guarantees do not.

### What happens if I lose my device?
You can recover access via Internet Identity's device recovery mechanism. In encrypted mode, your encryption keys are derived from your identity, not stored on any specific device.

### Has Rabbithole been audited?
The code is open source and available for community review. Formal audits are planned.

### What encryption does Rabbithole use?
AES-GCM with per-fragment encryption. Keys are derived via ICP's vetKeys threshold cryptography. See [Encryption](/en/how-it-works/encryption) for details.

## Technical

These answers define the Internet Computer concepts used throughout the docs.

### What is the Internet Computer?
A decentralized blockchain network created by DFINITY. It runs smart contracts (canisters) that can serve web content and store data at scale.

### What are canisters?
Smart contracts on the Internet Computer. They're like programs running on a decentralized computer network. See [Storage](/en/how-it-works/storage) for details.

### Can I self-host Rabbithole?
Yes. The code is [open source](https://github.com/rabbithole-app/v2). You can deploy your own canisters and frontend.

### Can I build my own client?
Yes. The canister API is public. You can build any client that communicates with the canisters via Candid.
