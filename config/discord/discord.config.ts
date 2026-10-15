import { GatewayIntentBits, Partials, type ClientOptions } from "discord.js";

export interface DiscordConfig {
  guildId: string;
  clientOptions: ClientOptions;
}

export const discordConfig: DiscordConfig = {
  // Guild ID is deployment-specific and can be supplied via environment variable
  guildId: process.env.DISCORD_GUILD_ID ?? "123456789012345678",
  clientOptions: {
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
    partials: [Partials.Channel, Partials.GuildMember],
  },
};
