---
name: jtc-algorithms
description: Use when implementing Join-to-Create voice rooms, room numbering, positioning, cleanup, or concurrency handling.
---

- Read the JTC behavior contract in `docs/PROJECT_BLUEPRINT.md`.
- Category order is Solo → Duo → Trio → Quad → Penta → Hexa → Septa → Octa and belongs in config.
- Allocate the first missing positive room number; do not simply use max + 1.
- Use configured naming patterns to identify managed rooms.
- Guard concurrent/replayed voice events to prevent duplicate rooms.
- Verify Discord channel positioning semantics before implementing insertion ordering.
- Clean up only eligible temporary rooms and make restart reconciliation safe.
- Keep room business logic out of the raw event handler.
