---
title: Terms of Service
description: Terms and conditions for using Rabbithole
---

# Terms of Service

**Last updated: May 18, 2026**

## Overview

Rabbithole is a decentralized encrypted file storage service built on the Internet Computer blockchain. By using Rabbithole, you agree to these terms.

## Your storage canister

When you create storage, a smart contract (canister) is deployed on the
Internet Computer. After setup completes successfully:

- **You are the sole controller** — Rabbithole removes itself from controllers
  during handoff. During setup, retries, or approved updates, Rabbithole may be
  added temporarily to install, retry, or update the deployment.
- **You own your data** — your canister stores ownership, access rules, and
  trusted records; on-chain files are stored in the canister, while Blob Storage
  files store their file bytes outside the canister
- **You are responsible** for your canister's cycle balance (operational fuel)

## What you can store

You may store any files that are legal in your jurisdiction. In encrypted mode,
we cannot read file contents because encryption happens in your browser. You are
solely responsible for what you store.

## What we provide

- **Web interface** at rabbithole.app for managing your files
- **Canister deployment** service for creating personal storage
- **Frontend updates** delivered to your canister (optional, you control whether to accept)

## What we don't guarantee

- **Uptime of rabbithole.app** — the web interface may experience downtime. However, your canister remains accessible at its direct URL regardless of rabbithole.app status
- **Data recovery** — if you lose access to your Internet Identity, we cannot recover your data. We have no master keys or backdoors
- **Cycle management** — if your canister runs out of cycles, it may be removed by the Internet Computer network. You are responsible for maintaining a sufficient cycle balance

## Payments

- Storage creation requires a one-time setup payment. It covers canister
  creation, the initial cycles balance, deployment operations, and related
  infrastructure costs.
- Payments are non-refundable once the canister is deployed
- Future cycle top-ups can be done directly through the Internet Computer without Rabbithole

## Intellectual property

- **Your files** remain yours. We claim no ownership or rights over your data
- **Rabbithole software** is open source under the licenses specified in our [GitHub repository](https://github.com/rabbithole-app/v2)

## Limitation of liability

To the maximum extent permitted by applicable law, Rabbithole is provided "as
is" and "as available" without warranties of any kind. We are not liable for:

- Loss of data due to canister cycle depletion, storage-mode funding, deletion,
  or failed exports
- Loss of access due to Internet Identity, wallet, browser, device, or network
  issues
- Failed canister upgrades, failed retries, or rejected updates
- Indirect, incidental, special, consequential, exemplary, or punitive damages
  arising from use of the service

Nothing in these terms limits liability that cannot be limited under applicable
law.

## Termination

- You can stop using Rabbithole at any time. Your canister continues to operate independently
- You can delete your canister and all data at any time
- We may discontinue the rabbithole.app interface, but your canister continues
  independently while it has cycles. File availability depends on your selected
  storage mode and storage funding.

## Changes to these terms

We may update these terms. Changes will be posted on this page. Continued use of Rabbithole after changes constitutes acceptance.

## Governing law

These terms are intended to apply where permitted by law. They do not limit
non-waivable consumer protection rights in your jurisdiction. The final
governing-law and venue rules for a paid transaction may also depend on the
legal entity, wallet, checkout provider, and jurisdiction involved in that
transaction.

## Contact

Questions? Open an issue on [GitHub](https://github.com/rabbithole-app/v2/issues) or reach out on [X (Twitter)](https://x.com/rabbithole_ic).
