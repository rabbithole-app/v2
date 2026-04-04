---
name: extension-core-infrastructure
description: Core infrastructure providing backend connection configuration, storage client, and React app entry point.
version: 0.1.2
compatibility:
  npm:
    "@caffeineai/core-infrastructure": "~0.1.0"
---

# Core Infrastructure

## Overview

This component provides the foundational infrastructure for all projects: backend connection configuration, Internet Identity authentication hooks, and actor management utilities.

## Integration

Core infrastructure is automatically included in every project. No manual integration steps are required.

# Frontend

The core-infrastructure frontend package (`@caffeineai/core-infrastructure`) is automatically included in every project. It provides:

- `useActor()` — React hook for creating and managing backend actor instances
- `useInternetIdentity()` — React hook for Internet Identity login/logout
