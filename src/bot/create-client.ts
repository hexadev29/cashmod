import { Client } from "discord.js";
import type { AppConfig } from "../core/config/config-types.js";

export const createClient = (config: AppConfig): Client => {
  return new Client(config.discord.clientOptions);
};
