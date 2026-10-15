---
name: discordjs-engineering
description: Use when implementing Discord client lifecycle, discord.js v14 events, channels, members, or API operations.
---

- Check the installed discord.js version and existing project conventions before coding.
- Keep event handlers thin; delegate domain behavior to services.
- Use correct discord.js v14 types and current API contracts.
- Handle missing/deleted resources and rejected API calls explicitly.
- Never log bot tokens or secret environment values.
- Avoid unbounded retries and fire-and-forget promises without rejection handling.
