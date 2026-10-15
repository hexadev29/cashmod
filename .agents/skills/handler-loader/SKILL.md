---
name: handler-loader
description: Use when implementing automatic discovery, validation, importing, or registration of Discord handlers.
---

- Read the handler-loader contract in `docs/PROJECT_BLUEPRINT.md`.
- Explicitly define the TypeScript handler export contract.
- Separate discovery, import, export validation, duplicate detection, and registration.
- Log candidate path, stage, duration, and stack trace where available.
- Exclude tests, fixtures, config, types, declarations, maps, and build artifacts.
- Support actual development and compiled production paths.
- Test discovery exclusions, invalid exports, duplicates, import failures, and registration failures.
