---
name: terminal-observability
description: Use when implementing logs, startup banners, diagnostics, debug output, or error reporting.
---

- Provide attractive colorized console output with a no-color fallback.
- Use consistent structured log fields and levels: fatal, error, warn, info, debug, trace.
- Debug mode adds useful detail; normal mode stays readable.
- Include stack traces where available and file/stage/timing for loader failures.
- Redact tokens and secrets. Never print environment values wholesale.
