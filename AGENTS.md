# Cash Mod — Agent Instructions

## Project identity
Cash Mod is a TypeScript Discord bot built with discord.js v14. The current target is one Discord guild (one server), not a multi-guild SaaS.

## Read these documents first
1. `docs/PROJECT_BLUEPRINT.md` — purpose, boundaries, proposed folder architecture, runtime flows, and implementation rules.
2. `.agents/rules/01-cash-mod-scope.md` — hard scope constraints.
3. `.agents/rules/02-quality-and-safety.md` — quality, security, and diagnostics requirements.
4. Relevant skill in `.agents/skills/` before implementing that subsystem.

## Current implementation scope
Implement only:
- Join-to-Create (JTC) voice rooms.
- Automatic handler discovery/loading/validation/registration.
- Configuration validation and startup diagnostics needed by those features.

Do not implement tickets, moderation, economy, web dashboards, databases, slash-command configuration, or other features unless explicitly requested. Future placeholders in the architecture are not permission to implement them.

## Architecture authority
`docs/PROJECT_BLUEPRINT.md` describes the intended target architecture. First inspect the existing repository and compare it against the blueprint. Do not blindly replace working code or assume the repository is empty. Report deviations and propose a minimal migration plan before making broad structural changes.

If the existing package manager, build setup, test framework, or source layout is already established, preserve it unless there is a concrete reason to change it. Never claim a file, test, or subsystem exists without verifying it.

## Configuration boundaries
- Keep configuration in source-controlled files under `config/`, with a separate directory for each feature/domain.
- Centralize shared permission policy in `config/permissions/`; feature-specific permission mappings belong in that feature's config folder.
- Keep server/guild/channel/category IDs and other deployment-specific values out of core and feature implementation files.
- Do not add slash commands for configuration or setup.
- Secrets such as the Discord bot token must come from environment variables or a secret manager, never committed config.
- Validate configuration at startup and fail with actionable diagnostics for invalid required values.

## Handler loader
- Discover only explicitly approved handler locations and file patterns.
- Exclude tests, config files, types, declarations, build output, maps, and unrelated files.
- Separate and report discovery, import, export validation, duplicate detection, and registration failures.
- Log the exact path, stage, elapsed time, and full error stack where available.
- Validate handler shape before registration; detect duplicate handler identities.
- Support the actual development and production output paths used by this repository.

## JTC requirements
- Category order: Solo → Duo → Trio → Quad → Penta → Hexa → Septa → Octa.
- Allocate the first missing room number. Example: if Solo rooms 1, 2, 3, and 5 exist, allocate 4.
- Position a newly created room according to the intended ordering, not merely at the end. Verify Discord's actual channel/category position semantics and API behavior before implementing positioning.
- Handle concurrent joins, duplicate voice-state events, missing trigger/category channels, API failures, cleanup, stale cache, and restart reconciliation.
- Do not assume a Discord API operation succeeded until it resolves successfully.
- Use centralized permission policy plus feature-level mappings; do not scatter permission decisions through event handlers.

## Logging and diagnostics
- Provide attractive, readable, colorized terminal output when supported, with a sensible non-color fallback.
- Use structured log records and levels such as fatal, error, warn, info, debug, and trace.
- Debug mode should add useful detail without leaking tokens, secrets, or sensitive data.
- Startup should summarize configuration validation, loader discovery/registration, and JTC readiness.
- Errors must include actionable context and stack traces where available.

## Engineering workflow
1. Inspect the repository and existing instructions.
2. Summarize the current structure and identify deviations from the blueprint.
3. Propose a small implementation plan before broad edits.
4. Make focused changes and preserve established conventions.
5. Add or update tests for changed behavior.
6. Run available tests, type checks, lint, and build scripts; report exactly what ran and its result.
7. Do not silently add dependencies or expand scope.
