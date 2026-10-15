---
name: testing-and-debugging
description: Use when testing or diagnosing configuration, handler loading, JTC lifecycle, or Discord API failure paths.
---

- Inspect existing test framework and scripts before adding tooling.
- Prefer deterministic unit tests for allocation, concurrency, cleanup decisions, config validation, and loader stages.
- Do not require live Discord credentials for unit tests.
- Test failure paths and race conditions, not only the happy path.
- Run available type-check, lint, tests, and build; report exact commands and results.
