import type { Client, ComponentEmojiResolvable } from "discord.js";
import type { PrivateJtcEmojisConfig } from "../../../config/private-jtc/private-jtc.config.js";

/**
 * Formats an emoji identifier for use in Discord text messages.
 * Discord custom emoji syntax requires <:name:id> or <a:name:id>.
 * If a raw snowflake ID is provided, it is formatted with the emoji name.
 * If the emoji is cached in the client (guild or application), cached.toString() is used.
 */
export const formatEmoji = (
  name: keyof PrivateJtcEmojisConfig,
  idOrTag: string,
  client?: Client | null,
): string => {
  if (!idOrTag) return "";

  // If already formatted as <:name:id> or <a:name:id> or unicode emoji
  if (
    idOrTag.startsWith("<:") ||
    idOrTag.startsWith("<a:") ||
    !/^\d+$/.test(idOrTag)
  ) {
    return idOrTag;
  }

  // Attempt resolution from client guild or application emoji caches
  if (client) {
    const cached =
      client.emojis?.cache?.get(idOrTag) ??
      (client as any).application?.emojis?.cache?.get(idOrTag);
    if (cached) {
      return cached.toString();
    }
  }

  const emojiName = name === "block" ? "cross" : name;

  // Standard Discord custom emoji markdown
  return `<:${emojiName}:${idOrTag}>`;
};

/**
 * Resolves an emoji for use in Discord ButtonBuilder or component emojis.
 * Ensures the emoji has both id and name so Discord displays the icon properly.
 */
export const resolveButtonEmoji = (
  name: keyof PrivateJtcEmojisConfig,
  idOrTag: string,
  client?: Client | null,
): ComponentEmojiResolvable => {
  const emojiName = name === "block" ? "cross" : name;

  if (client) {
    const cached =
      client.emojis?.cache?.get(idOrTag) ??
      (client as any).application?.emojis?.cache?.get(idOrTag);
    if (cached) {
      return {
        id: cached.id,
        name: cached.name ?? emojiName,
        animated: cached.animated ?? false,
      };
    }
  }

  if (idOrTag.startsWith("<a:")) {
    const match = idOrTag.match(/<a:(\w+):(\d+)>/);
    if (match) {
      return { animated: true, name: match[1], id: match[2] };
    }
  }

  if (idOrTag.startsWith("<:")) {
    const match = idOrTag.match(/<:(\w+):(\d+)>/);
    if (match) {
      return { animated: false, name: match[1], id: match[2] };
    }
  }

  if (/^\d+$/.test(idOrTag)) {
    return { id: idOrTag, name: emojiName };
  }

  return idOrTag;
};
