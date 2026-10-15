---
name: Quality and safety
description: Enforces config boundaries, safe async handling, tests, and actionable diagnostics.
---

- Keep server-specific IDs and configurable behavior in source-controlled `config/` files, split by domain/feature.
- Keep shared permission policy centralized; feature-specific permission mappings belong with that feature's config.
- Secrets must come from environment variables or a secret manager and must never be committed or logged.
- Validate configuration at startup.
- Catch and report async failures with useful context and stack traces where available.
- Do not claim tests/build/lint passed unless actually run.
- Prefer small, testable changes and preserve existing project conventions.
