# Cash Mod — Project Blueprint

## 1. Purpose and current boundary

Cash Mod is a single-guild Discord bot written in TypeScript using discord.js v14.

### In scope now

1. Join-to-Create (JTC) voice room lifecycle.
2. Automatic handler discovery, validation, and registration.
3. Configuration validation and diagnostics needed to run those systems.
4. Centralized permissions policy used by JTC.

### Not in scope now

Tickets, moderation, economy, leveling, music, web dashboard, multi-guild tenancy, database-backed configuration, and slash commands for setup/configuration. Do not implement these just because future config folders or extension points are shown below.

## 2. Proposed repository architecture

Preserve the project's existing package manager, test framework, build tool, and conventions where practical. Treat this tree as the target organization; inspect before moving files.

```text
CashMod/
├── AGENTS.md
├── README.md
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── config/
│   ├── discord/
│   │   └── discord.config.ts
│   ├── permissions/
│   │   └── permissions.config.ts
│   ├── jtc/
│   │   └── jtc.config.ts
│   └── diagnostics/
│       └── diagnostics.config.ts
├── docs/
│   └── PROJECT_BLUEPRINT.md
├── .agents/
│   ├── rules/
│   └── skills/
├── src/
│   ├── main.ts
│   ├── bot/
│   │   ├── create-client.ts
│   │   └── start-bot.ts
│   ├── core/
│   │   ├── config/
│   │   │   ├── load-config.ts
│   │   │   └── validate-config.ts
│   │   ├── errors/
│   │   ├── events/
│   │   ├── permissions/
│   │   │   └── permission-service.ts
│   │   └── lifecycle/
│   ├── handlers/
│   │   ├── loader/
│   │   │   ├── discover-handlers.ts
│   │   │   ├── validate-handler.ts
│   │   │   ├── register-handlers.ts
│   │   │   └── loader-types.ts
│   │   └── voice/
│   │       └── voice-state-update.handler.ts
│   ├── modules/
│   │   └── jtc/
│   │       ├── jtc-service.ts
│   │       ├── room-allocator.ts
│   │       ├── room-positioner.ts
│   │       ├── room-cleanup.ts
│   │       ├── jtc-reconciliation.ts
│   │       └── jtc-types.ts
│   ├── diagnostics/
│   │   ├── logger.ts
│   │   ├── console-theme.ts
│   │   ├── startup-report.ts
│   │   └── redact-secrets.ts
│   └── shared/
│       └── types/
├── tests/
│   ├── unit/
│   │   ├── handler-loader/
│   │   └── jtc/
│   └── integration/
└── dist/                  # generated build output; never hand-edit or scan as source
```

This is a proposed logical layout, not a requirement to create every file immediately. Keep modules cohesive; avoid empty placeholder files. If the existing project uses a different but sound layout, document the mapping rather than doing a large refactor without approval.

## 3. Responsibilities and dependency direction

### `config/`

Source-controlled, non-secret defaults and deployment-specific values. Each domain/feature gets its own directory. Examples:

- `config/discord/`: guild ID, client intents/partial settings, configured channel IDs when deployment-specific.
- `config/permissions/`: shared permission policy and defaults.
- `config/jtc/`: trigger voice channel IDs, category IDs/order, room naming, room limits, cleanup behavior, and positioning anchor.
- `config/diagnostics/`: log level, pretty/color output preferences, debug mode.

Do not place bot tokens or other secrets here. Use environment variables for secrets. Avoid reading `process.env` throughout feature code; load and validate environment/config once at startup and pass typed configuration into services.

### `src/core/`

Cross-cutting infrastructure: validated configuration, lifecycle, shared errors/events, and the permission service. Core must not contain server-specific IDs or JTC-specific behavior.

### `src/modules/jtc/`

JTC domain logic: allocating the first missing room number, creating rooms, ordering rooms, handling cleanup, and reconciling stale state after restarts. Keep Discord event parsing in handlers and business rules in the service layer where practical.

### `src/handlers/`

Thin adapters between Discord events and feature services. The voice-state handler should validate the event context and delegate to JTC services; it should not become the place where all JTC logic lives.

### `src/handlers/loader/`

Discover only approved handler files, import them safely, validate required exports and event metadata, detect duplicate identities, then register. Keep each stage independently observable and testable.

### `src/diagnostics/`

Human-friendly startup banner and colorized terminal output, structured logs, log levels, timing, error stacks, and secret redaction. Color must degrade gracefully when output is redirected or unsupported.

### `tests/`

Test deterministic allocation, concurrency safeguards, cleanup decisions, config validation, handler export validation, duplicate detection, discovery exclusions, and loader failure reporting. Tests and fixtures must never be loaded as production handlers.

## 4. Configuration boundaries

- All configurable IDs and policy values belong in config files, not implementation modules.
- Shared permission policy belongs in `config/permissions/`; feature-specific role/permission mappings belong in that feature's config.
- Runtime code receives validated, typed configuration through a single config provider/registry.
- No setup/configuration slash commands.
- Runtime state is not configuration. If persistent runtime state becomes necessary, design it explicitly; do not introduce a database just for config without approval.
- Keep `.env` out of version control. Provide `.env.example` with names/placeholders only.

## 5. Handler loader contract

The loader should report the stage and outcome for each candidate:

1. Discovery — why a file was included or excluded.
2. Import — whether dynamic import succeeded.
3. Export validation — whether the module exposes the required handler contract.
4. Duplicate detection — whether its handler identity conflicts with another handler.
5. Registration — whether discord.js registration/listener attachment succeeded.

For failures, include the exact relative/absolute file path (as useful), stage, elapsed time, concise message, and stack trace when available. Continue past isolated handler failures when safe, but fail startup if required handlers are absent or a critical invariant is violated. Define the handler contract explicitly in TypeScript and test it.

The loader must work with the repository's actual development and compiled production paths. Do not hardcode only `src/` if production executes from `dist/`. Exclude tests, `.d.ts`, config, type-only files, maps, fixtures, and build artifacts from discovery.

## 6. JTC behavior contract

### Category order

`Solo → Duo → Trio → Quad → Penta → Hexa → Septa → Octa`

Keep this order in JTC configuration, not scattered conditionals.

### Allocation

Choose the first missing positive room number within the applicable room group. Example: existing Solo rooms 1, 2, 3, and 5 means the next allocated room is 4, not 6. Parse only names matching the configured naming pattern; do not mistake unrelated channels for JTC rooms.

### Creation flow

1. Receive a voice-state transition.
2. Ignore irrelevant transitions and duplicate/replayed work safely.
3. Confirm the member joined a configured trigger channel.
4. Resolve and validate the destination category/config.
5. Acquire a per-member/per-trigger concurrency guard or equivalent idempotency mechanism.
6. Allocate the first missing room number.
7. Create the room with permissions derived through the centralized permission service.
8. Place the room in the intended order. Verify Discord's channel position behavior and API constraints before coding; don't assume a numeric position means a stable insertion point.
9. Move the member only after successful creation and configuration.
10. Release guards in `finally` and log failures with context.

### Cleanup and resilience

- Delete only eligible empty temporary rooms; never delete unrelated user-managed channels.
- Handle API rejection, deleted/missing channels, stale cache, and partially completed creation.
- Reconcile stale temporary rooms after restart using an explicit, safe rule.
- Avoid unbounded retries and duplicate room creation.
- Make concurrency and cleanup behavior testable without a live Discord connection.

## 7. Permission design

- Centralize permission decisions in `src/core/permissions/permission-service.ts`.
- Keep default/shared policy in `config/permissions/`.
- Keep JTC-specific overrides/mappings in `config/jtc/`.
- Avoid duplicating allow/deny arrays across handlers.
- Fail clearly on contradictory or invalid permission config.
- Do not log secrets or private member data unnecessarily.

## 8. Logging and startup UX

Provide a polished startup banner and consistent logs:

- Levels: `fatal`, `error`, `warn`, `info`, `debug`, `trace`.
- Human-readable colorized console output with a plain-text fallback.
- Structured fields for subsystem, event, file, stage, duration, and error.
- Debug mode should reveal loader decisions and JTC state transitions without flooding normal logs.
- Redact bot tokens, authorization headers, and environment secrets.
- Startup summary should show validated config status (never secret values), discovered/registered handler counts, loader failures, and JTC readiness.

## 9. Minimum tests before calling the feature complete

### Handler loader

- valid handler loads and registers;
- invalid export is rejected with a useful diagnostic;
- duplicate handler identity is detected;
- import failure names the exact file and stage;
- test/config/type/build files are excluded;
- dev and production path resolution is covered.

### JTC

- first missing number is chosen;
- names that do not match the configured pattern are ignored;
- concurrent joins do not create duplicate rooms;
- failure during creation does not leave misleading in-memory state;
- only eligible empty temporary rooms are cleaned up;
- missing trigger/category and Discord API errors are handled;
- room ordering logic has tests for insertion between existing rooms.

### Configuration and safety

- invalid required config fails early with actionable errors;
- secrets are not printed;
- no configurable guild/channel IDs are embedded in feature/core implementation code.

## 10. Implementation process

Before coding, inspect the real repository and provide:

1. actual folder tree;
2. package scripts, dependencies, runtime and build entrypoints;
3. current handler-loader behavior;
4. current JTC behavior;
5. config-boundary violations;
6. existing tests and available checks;
7. differences from this blueprint;
8. a minimal implementation sequence.

Do not rewrite the project wholesale. Implement one coherent slice at a time and run the checks that the repository actually provides.
