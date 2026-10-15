import "dotenv/config";
import dotenv from "dotenv";
import type { AppConfig } from "./config-types.js";
import { discordConfig } from "../../../config/discord/discord.config.js";
import { permissionsConfig } from "../../../config/permissions/permissions.config.js";
import { buildJtcConfig } from "../../../config/jtc/jtc.config.js";
import { diagnosticsConfig } from "../../../config/diagnostics/diagnostics.config.js";
import { validateConfig } from "./validate-config.js";
import { registerSecret } from "../../diagnostics/redact-secrets.js";

let cachedConfig: AppConfig | null = null;

export const clearConfigCache = (): void => {
  cachedConfig = null;
};

export const loadConfig = (
  overrideEnv?: NodeJS.ProcessEnv,
): Readonly<AppConfig> => {
  if (cachedConfig && !overrideEnv) {
    return cachedConfig;
  }

  // Load .env into process.env if available
  dotenv.config();

  const envSource = overrideEnv ?? process.env;
  const token = envSource.DISCORD_TOKEN ?? "";

  // Register secret for redactor
  registerSecret(token);

  const rawConfig: AppConfig = {
    env: {
      nodeEnv:
        (envSource.NODE_ENV as "development" | "production" | "test") ||
        "development",
      token,
      clientId: envSource.DISCORD_CLIENT_ID,
    },
    discord: {
      ...discordConfig,
      guildId: envSource.DISCORD_GUILD_ID ?? discordConfig.guildId,
    },
    permissions: permissionsConfig,
    jtc: buildJtcConfig(envSource),
    diagnostics: {
      ...diagnosticsConfig,
      logLevel: (envSource.LOG_LEVEL as any) || diagnosticsConfig.logLevel,
      debugMode: envSource.DEBUG_MODE === "true" || diagnosticsConfig.debugMode,
    },
  };

  validateConfig(rawConfig);

  const frozen = Object.freeze(rawConfig);
  if (!overrideEnv) {
    cachedConfig = frozen;
  }
  return frozen;
};
