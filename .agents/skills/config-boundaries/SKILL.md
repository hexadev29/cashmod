---
name: config-boundaries
description: Use when adding configuration, IDs, permissions, environment variables, or feature settings.
---

- Read `docs/PROJECT_BLUEPRINT.md` before changing config structure.
- Give each feature/domain its own folder under `config/`.
- Centralize shared permission policy in `config/permissions/`; keep feature-specific mappings in that feature's config.
- Load and validate configuration once at startup, then pass typed values to services.
- Never embed guild/channel/category IDs in core or feature implementation files.
- Keep secrets in environment variables or a secret manager; `.env` must be ignored by git.
- No slash commands for setup/configuration.
