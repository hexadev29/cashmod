import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "discord.js";
import { loadConfig } from "../core/config/load-config.js";
import { PermissionService } from "../core/permissions/permission-service.js";
import { JtcService } from "../modules/jtc/jtc-service.js";
import { setJtcService } from "../modules/jtc/jtc-instance.js";
import { createClient } from "./create-client.js";
import { loadAndRegisterHandlers } from "../handlers/loader/register-handlers.js";
import { logger } from "../diagnostics/logger.js";
import {
  printStartupBanner,
  printStartupSummary,
} from "../diagnostics/startup-report.js";

export interface StartBotResult {
  client: Client;
  jtcService: JtcService;
}

export const startBot = async (): Promise<StartBotResult> => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const handlersDir = path.resolve(currentDir, "../handlers");

  // 1. Load and validate configuration
  const config = loadConfig();

  // 2. Configure diagnostics
  logger.setLevel(config.diagnostics.logLevel);

  if (config.diagnostics.showBanner) {
    printStartupBanner();
  }

  logger.info("Cash Mod starting up...");
  logger.debug(`Target Guild ID: ${config.discord.guildId}`);

  // 3. Initialize Core Services
  const permissionService = new PermissionService(
    config.permissions,
    config.jtc.permissions,
  );
  const jtcService = new JtcService(config, permissionService);
  setJtcService(jtcService);

  // 4. Create Discord Client
  const client = createClient(config);

  // 5. Discover & Register Handlers
  const loaderSummary = await loadAndRegisterHandlers(client, {
    handlersDir,
    failFastOnCritical: true,
  });

  // 6. Register Ready Listener for JTC Reconciliation & Summary Display
  client.once("ready", async (readyClient) => {
    logger.info(
      `Discord client ready as ${readyClient.user.tag} (${readyClient.user.id})`,
    );

    const targetGuild = readyClient.guilds.cache.get(config.discord.guildId);
    if (targetGuild) {
      logger.info(
        `Connected to target guild "${targetGuild.name}" (${targetGuild.id})`,
      );
      const reconResult = await jtcService.reconcile(targetGuild);
      logger.debug(
        `Reconciliation finished: scanned ${reconResult.totalScanned} room(s).`,
      );
    } else {
      logger.warn(
        `Bot is not in target guild ID: ${config.discord.guildId}. Please check permissions or bot invites.`,
      );
    }

    const categoriesList = Object.values(config.jtc.categories);

    printStartupSummary({
      botTag: readyClient.user.tag,
      guildId: config.discord.guildId,
      nodeVersion: process.version,
      logLevel: config.diagnostics.logLevel,
      configValid: true,
      handlers: {
        discovered: loaderSummary.discovered,
        registered: loaderSummary.registered,
        skipped: loaderSummary.skipped,
        failed: loaderSummary.failed,
      },
      jtc: {
        categoriesCount: categoriesList.length,
        triggersCount: Object.keys(config.jtc.triggers).length,
        firstCategory: config.jtc.categoryOrder[0],
        lastCategory:
          config.jtc.categoryOrder[config.jtc.categoryOrder.length - 1],
      },
    });
  });

  // 7. Login to Discord Gateway
  logger.info("Connecting to Discord Gateway...");
  await client.login(config.env.token);

  return { client, jtcService };
};
