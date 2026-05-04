---
title: Privacy Policy
description: How Rabbithole handles your data and protects your privacy
---

# Privacy Policy

**Last updated: March 2026**

## The short version

Rabbithole is designed around encrypted storage, and in encrypted mode we **cannot** access your file contents. When encryption is enabled, files are encrypted in your browser before they reach the network. We have no master keys and no backdoors for that encrypted mode.

## What we don't collect

- **Encrypted file contents** — in encrypted mode, we never see plaintext
- **Encryption keys** — in encrypted mode, they are derived via threshold cryptography and never exist in one place
- **Passwords** — there are none; authentication is via Internet Identity (passkeys/biometrics)
- **Email addresses** — not required for registration
- **Browsing history or tracking data** — no analytics, no cookies, no third-party trackers

## What we do process

### Internet Identity Principal

When you sign in, your browser generates a cryptographic identity (Principal ID) via Internet Identity. This identity is:
- Unique to Rabbithole (cannot be used to track you across other apps)
- Not linked to any personal information
- Stored only on the Internet Computer blockchain

### Canister interactions

Your personal storage canister records:
- File metadata (names, sizes, folder structure) — stored in your canister, not encrypted
- File contents — encrypted when encryption is enabled
- Access permissions you set

All data is stored in your canister, which you own and control. Rabbithole removes itself as controller after setup.

### Payment information

When creating a storage canister, payment is processed to cover Internet Computer network costs (cycles). We do not store payment details. The entire payment goes to the network — Rabbithole takes zero profit.

## Data location

Your canister data is stored on the [Internet Computer](https://internetcomputer.org), distributed across independent nodes operated by different parties worldwide. In encrypted mode, no single node operator can access the file contents.

## Data retention

Your data persists as long as your canister has cycles (fuel). You can:
- Top up cycles directly without Rabbithole
- Delete your data at any time
- Export your data at any time

If Rabbithole ceases to exist, your data remains accessible via your canister's direct URL.

## Third-party services

- **Internet Identity** — authentication provider (open source, operated by DFINITY Foundation)
- **Internet Computer** — decentralized blockchain network
- **Blob Storage infrastructure** — used when files are stored outside the canister; in encrypted mode it stores ciphertext, without encryption it may see file contents

We do not use Google Analytics, Facebook Pixel, or any third-party tracking service.

## Open source

Our code is [open source on GitHub](https://github.com/rabbithole-app/v2). You can verify every claim in this policy by reading the source code.

## Changes to this policy

We will update this page if our practices change. Since we're open source, any changes are visible in our commit history.

## Contact

Questions about privacy? Open an issue on [GitHub](https://github.com/rabbithole-app/v2/issues) or reach out on [X (Twitter)](https://x.com/rabbithole_ic).
