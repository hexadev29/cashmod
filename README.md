# Cash Mod — Antigravity Setup Pack

This pack provides workspace-level instructions, always-on rules, and reusable agent skills for Google Antigravity.

## Install into an existing Cash Mod repository

1. Download and extract this ZIP.
2. Copy `AGENTS.md` into the repository root. If one already exists, merge the instructions rather than overwriting project-specific rules.
3. Copy the `.agents/` directory into the repository root. Merge folders if `.agents/` already exists.
4. Open the repository root as the Antigravity workspace.
5. Open the Agent/Customizations panel and inspect Rules and Skills to confirm discovery.
6. Start with the verification prompt below; ask the agent to inspect before editing.

## Verification prompt

> Inspect `AGENTS.md`, `.agents/rules/`, and `.agents/skills/` and confirm the Cash Mod instructions were discovered. Do not edit code yet. Inspect the existing repository and report the current architecture, package scripts, config-boundary violations, handler-loader status, JTC status, and a minimal implementation plan. Do not add dependencies or implement future features.

## Contents

- `AGENTS.md`: project-wide engineering contract.
- `.agents/rules/`: concise always-on rules.
- `.agents/skills/`: focused skills for Discord.js, config boundaries, handler loader, JTC algorithms, terminal observability, permissions, testing/debugging, and the workflow.

## Notes

- Workspace skills are stored in `.agents/skills/<skill-name>/SKILL.md`; Antigravity also supports the legacy `.agent/skills/` location.
- This pack defines agent instructions; it does not implement the bot itself.
- Keep tokens out of source control.
- Skills guide the agent but do not replace tests, code review, or runtime permission checks.
