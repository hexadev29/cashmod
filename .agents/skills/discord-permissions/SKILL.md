---
name: discord-permissions
description: Use when defining channel permission overwrites or shared/feature-specific access policy.
---

- Shared permission policy belongs in `config/permissions/`.
- JTC-specific mappings and overrides belong in `config/jtc/`.
- Route decisions through the centralized permission service.
- Do not scatter duplicated permission arrays or ad hoc policy checks across handlers.
- Validate contradictory configuration and test the resulting overwrite decisions.
