import {
  ActivityType,
  GatewayIntentBits,
  Partials,
  type ClientOptions,
} from "discord.js";

export type BotActivityTypeString =
  | "Listening"
  | "Playing"
  | "Streaming"
  | "Watching"
  | "Competing"
  | "Custom";

export interface BotActivityConfig {
  name: string;
  type: ActivityType;
}

export interface DiscordConfig {
  guildId: string;
  activity: BotActivityConfig;
  clientOptions: ClientOptions;
}

export const parseActivityType = (typeStr?: string): ActivityType => {
  switch (typeStr?.trim().toLowerCase()) {
    case "playing":
      return ActivityType.Playing;
    case "streaming":
      return ActivityType.Streaming;
    case "watching":
      return ActivityType.Watching;
    case "competing":
      return ActivityType.Competing;
    case "custom":
      return ActivityType.Custom;
    case "listening":
    default:
      return ActivityType.Listening;
  }
};

export const buildDiscordConfig = (
  env: NodeJS.ProcessEnv = process.env,
): DiscordConfig => {
  const activityName = env.BOT_ACTIVITY_NAME ?? "CA Study Hub";
  const activityType = parseActivityType(env.BOT_ACTIVITY_TYPE ?? "Listening");

  return {
    guildId: env.DISCORD_GUILD_ID ?? "123456789012345678",
    activity: {
      name: activityName,
      type: activityType,
    },
    clientOptions: {
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
      partials: [Partials.Channel, Partials.GuildMember],
      presence: {
        activities: [
          {
            name: activityName,
            type: activityType,
          },
        ],
        status: "online",
      },
    },
  };
};

export const discordConfig: DiscordConfig = buildDiscordConfig();
