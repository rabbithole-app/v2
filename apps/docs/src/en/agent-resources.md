---
title: Agent resources
description: Machine-readable Rabbithole documentation for AI agents and coding assistants
---

# Agent resources

This docs site implements the
[Agent-Friendly Documentation Spec](https://agentdocsspec.com/). It publishes
plain-text entry points that AI agents can fetch before answering questions
about Rabbithole.

## Files for agents

Use these files when an agent needs to read the English documentation:

- <a href="/llms.txt">/llms.txt</a>: a discovery index listing the
  documentation pages. Use it when the agent can fetch only the pages it needs.
- <a href="/llms-full.txt">/llms-full.txt</a>: the full English documentation
  in one text file. Use it when the agent needs the whole docs context and has
  enough context window.

## What to tell an agent

Paste this into your agent:

```txt
Use /llms.txt from this documentation site as the Rabbithole docs index.
```

## Copy a single page

The Markdown links for individual pages are listed in `/llms.txt`. For example:
<a href="/getting-started/introduction.md">/getting-started/introduction.md</a>.

When browsing manually, use **Copy Markdown** in the page header to copy the
current page without navigation or site chrome.
