---
title: Trust Model
description: Why you can trust Rabbithole with your files
sidebar:
  order: 4
---

## What do you need to trust?

Every storage system requires some level of trust. Here's exactly what Rabbithole requires — and what it doesn't.

### You do NOT need to trust

- **Rabbithole team** — we never see your plaintext data
- **ICP node operators** — they only process encrypted blobs
- **Network infrastructure** — encryption happens before data touches the network

### You DO need to trust

- **The encryption code** — it's [open source](https://github.com/rabbithole-app/v2), audit it yourself
- **Your browser** — the encryption runs in your browser's JavaScript engine
- **Internet Identity** — for authentication (also open source)
- **ICP consensus** — that the network correctly executes canister code

## Threat model

| Threat | Protected? | How |
|--------|-----------|-----|
| Rabbithole reads your files | Yes | Client-side encryption, zero-knowledge storage |
| Hacker breaches your canister | Yes | Only encrypted blobs stored |
| Man-in-the-middle attack | Yes | IC certified responses + HTTPS |
| ICP node operator peeks at data | Yes | Data encrypted before reaching IC |
| Government requests your data | Yes | Rabbithole has nothing to hand over |
| You lose your device | Partial | Re-authenticate with recovery on Internet Identity |
| Malicious code update | Mitigated | Open source, canister upgrade requires controller (you) |

## Rabbithole vs Traditional Cloud

```mermaid
flowchart TB
    subgraph Traditional["Traditional Cloud (Google, Dropbox)"]
        direction TB
        U1[You] -->|upload| CS[Company Server]
        CS --> F1[Your files\nreadable by company]
        MK[Master key] --> CS
        GOV1[Government] -->|can request data| CS
        style CS fill:#fca5a5,stroke:#dc2626
        style MK fill:#fca5a5,stroke:#dc2626
        style GOV1 fill:#fef3c7,stroke:#d97706
    end
    subgraph Rabbithole["Rabbithole"]
        direction TB
        U2[You] ==>|encrypted upload| CAN[Your Canister]
        CAN --> F2[Encrypted fragments\nunreadable]
        GOV2[Government] -.-x|nothing to decrypt| CAN
        style CAN fill:#86efac,stroke:#16a34a
        style F2 fill:#86efac,stroke:#16a34a
        style GOV2 fill:#fef3c7,stroke:#d97706
    end
    style Traditional fill:#fef2f2,stroke:#dc2626
    style Rabbithole fill:#f0fdf4,stroke:#16a34a
```

## Comparison with other solutions

| Solution | Decentralization | Trust Required | Data Sovereignty |
|----------|:---:|:---:|:---:|
| Google Drive | — | High | None |
| Dropbox | — | High | None |
| Tresorit | — | Medium | Partial (E2E, but company controls infra) |
| IPFS + Encryption | High | Medium | Partial (no built-in encryption) |
| **Rabbithole** | **High** | **Low** | **Full (you own the canister)** |

:::note{title="No system is perfect"}

Rabbithole minimizes trust assumptions, but no system can eliminate them entirely. We believe in transparency: if you find a weakness, [report it](https://github.com/rabbithole-app/v2/issues).

:::
