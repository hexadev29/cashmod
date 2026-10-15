import type { DiscordConfig } from "../../../config/discord/discord.config.js";
import type { GlobalPermissionsConfig } from "../../../config/permissions/permissions.config.js";
import type { JtcConfig } from "../../../config/jtc/jtc.config.js";
import type { PrivateJtcConfig } from "../../../config/private-jtc/private-jtc.config.js";
import type { DiagnosticsConfig } from "../../../config/diagnostics/diagnostics.config.js";

export interface AppConfig {
  env: {
    nodeEnv: "development" | "production" | "test";
    token: string;
    clientId?: string;
  };
  discord: DiscordConfig;
  permissions: GlobalPermissionsConfig;
  jtc: JtcConfig;
  privateJtc: PrivateJtcConfig;
  diagnostics: DiagnosticsConfig;
}

