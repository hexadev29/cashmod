---
name: Cash Mod scope
description: Enforces the current single-guild bot scope and prevents unrelated feature work.
---

- Cash Mod is a single-guild TypeScript bot using discord.js v14.
- Current scope is JTC voice rooms and the automatic handler loader only, plus necessary config validation, permissions infrastructure, and diagnostics.
- Do not implement tickets, moderation, economy, web UI, database-backed configuration, multi-guild support, or setup/config slash commands without an explicit request.
- Follow `docs/PROJECT_BLUEPRINT.md`; inspect the existing repository before structural edits.
- Future folder examples are architectural guidance, not permission to implement future features.
