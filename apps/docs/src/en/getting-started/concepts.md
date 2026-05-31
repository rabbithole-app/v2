---
title: Core concepts
description: Internet Computer terms as they appear in Rabbithole
---

# Core concepts

These terms come from the Internet Computer, not from Rabbithole branding.
Rabbithole uses them in a product context, so this page maps the platform words
to the parts of the app you will see in the docs.

For the canonical IC wording, see the
[Internet Computer glossary](https://docs.internetcomputer.org/references/glossary/).

## Internet Computer

The [Internet Computer](https://internetcomputer.org/) is a decentralized
network for running applications directly on-chain. Unlike blockchains that are
mainly used as settlement layers, the Internet Computer can host backend logic,
state, and web-facing canisters in the same environment.

Rabbithole uses it across the product: the main frontend, the main backend
canister, the storage canisters created for users, and holding or moving user
funds from other networks through
[Chain Fusion](https://docs.internetcomputer.org/concepts/chain-fusion/).

## Canister

A [canister](https://docs.internetcomputer.org/concepts/canisters/) is the
Internet Computer's smart-contract unit. It bundles code and state, runs on the
network, and can be reached over the Internet.

In the Rabbithole architecture, the main backend is a canister. Each user
storage is also a canister. A storage canister keeps file records, permissions,
and, depending on the storage mode, file bytes.

## Principal

A [principal](https://docs.internetcomputer.org/concepts/principals/) is an IC
identifier for something that can call canisters. It can represent a user,
another canister, or the anonymous caller.

In Rabbithole docs, the word usually means your user principal: the identity
used to own storage, call canisters, and receive permissions.

## Internet Identity

[Internet Identity](https://id.ai) is the Internet Computer's native
authentication system. It lets you sign in with passkeys or supported OpenID
accounts instead of creating a Rabbithole password.

Internet Identity gives each frontend origin a separate principal for the same
user. That helps prevent different apps from tracking you through one global
account identifier. In Rabbithole, this is the identity layer your browser uses
to call canisters, own storage, and request access to encrypted files.

For implementation details, see the
[Internet Identity guide](https://docs.internetcomputer.org/guides/authentication/internet-identity/).

## Controller

A controller has administrative rights over a canister. A controller can upgrade
canister code, change settings, or delete the canister.

For Rabbithole storage, controller status matters during setup and updates.
Rabbithole may temporarily need controller access while it creates or updates
your storage canister. After a successful handoff, the intended final state is
that you control the canister.

## Cycles

[Cycles](https://docs.internetcomputer.org/concepts/cycles/) are the unit used
to pay for resources on the Internet Computer: processing, memory, storage, and
network bandwidth. Each canister has a cycles account, and its resource usage
is charged to that account.

In Rabbithole, cycles keep your storage canister running. The setup fee covers
canister creation and the initial cycle balance. Later, a storage canister may
need more cycles to continue operating.

## How the pieces fit together

When you create storage, Rabbithole deploys a storage canister and funds it with
cycles. You sign in through Internet Identity, and Rabbithole receives a
principal for your session. After setup handoff, that principal is the owner
identity Rabbithole uses for your storage canister.

Your browser encrypts files before upload. The encryption page explains the key
flow in more detail.
