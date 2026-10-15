import { theme } from "./console-theme.js";

export interface StartupSummary {
  botTag: string;
  guildId: string;
  nodeVersion: string;
  pnpmVersion?: string;
  logLevel: string;
  configValid: boolean;
  handlers: {
    discovered: number;
    registered: number;
    skipped: number;
    failed: number;
  };
  jtc: {
    categoriesCount: number;
    triggersCount: number;
    firstCategory: string;
    lastCategory: string;
  };
}

export const printStartupBanner = (): void => {
  const line = "═".repeat(60);
  console.log(theme.cyan(`╔${line}╗`));
  console.log(
    theme.cyan("║") +
      theme.bold(
        theme.magenta(
          "   ██████╗ █████╗ ███████╗██╗  ██╗███╗   ███╗ ██████╗ ██████╗  ",
        ),
      ) +
      theme.cyan("║"),
  );
  console.log(
    theme.cyan("║") +
      theme.bold(
        theme.magenta(
          "  ██╔════╝██╔══██╗██╔════╝██║  ██║████╗ ████║██╔═══██╗██╔══██╗ ",
        ),
      ) +
      theme.cyan("║"),
  );
  console.log(
    theme.cyan("║") +
      theme.bold(
        theme.magenta(
          "  ██║     ███████║███████╗███████║██╔████╔██║██║   ██║██║  ██║ ",
        ),
      ) +
      theme.cyan("║"),
  );
  console.log(
    theme.cyan("║") +
      theme.bold(
        theme.magenta(
          "  ██║     ██╔══██║╚════██║██╔══██║██║╚██╔╝██║██║   ██║██║  ██║ ",
        ),
      ) +
      theme.cyan("║"),
  );
  console.log(
    theme.cyan("║") +
      theme.bold(
        theme.magenta(
          "  ╚██████╗██║  ██║███████║██║  ██║██║ ╚═╝ ██║╚██████╔╝██████╔╝ ",
        ),
      ) +
      theme.cyan("║"),
  );
  console.log(
    theme.cyan("║") +
      theme.bold(
        theme.magenta(
          "   ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝ ╚═════╝ ╚═════╝  ",
        ),
      ) +
      theme.cyan("║"),
  );
  console.log(
    theme.cyan("║") +
      theme.dim(
        "        Single-Guild JTC Voice Engine & Modular Bot         ",
      ) +
      theme.cyan("║"),
  );
  console.log(theme.cyan(`╚${line}╝`));
};

export const printStartupSummary = (summary: StartupSummary): void => {
  console.log(
    "\n" + theme.bold(theme.blue("─── Cash Mod Startup Summary ───")),
  );
  console.log(
    `  ${theme.dim("Bot User:")}         ${theme.green(summary.botTag)}`,
  );
  console.log(
    `  ${theme.dim("Target Guild ID:")}  ${theme.yellow(summary.guildId)}`,
  );
  console.log(`  ${theme.dim("Node Runtime:")}     ${summary.nodeVersion}`);
  console.log(
    `  ${theme.dim("Log Level:")}        ${theme.magenta(summary.logLevel)}`,
  );
  console.log(
    `  ${theme.dim("Config Valid:")}     ${summary.configValid ? theme.green("✓ VALID") : theme.red("✗ INVALID")}`,
  );
  console.log(
    `  ${theme.dim("Handler Loader:")}   ${theme.green(String(summary.handlers.registered))} registered, ` +
      `${theme.yellow(String(summary.handlers.skipped))} skipped, ` +
      `${summary.handlers.failed > 0 ? theme.red(String(summary.handlers.failed) + " failed") : "0 failed"}`,
  );
  console.log(
    `  ${theme.dim("JTC Configuration:")} ${theme.cyan(String(summary.jtc.categoriesCount))} categories (${summary.jtc.firstCategory} → ${summary.jtc.lastCategory}), ` +
      `${theme.cyan(String(summary.jtc.triggersCount))} trigger(s) configured`,
  );
  console.log(theme.bold(theme.blue("─────────────────────────────────\n")));
};
