import path from "node:path";
import fs from "node:fs";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type BaseMessageOptions,
  type Client,
} from "discord.js";
import type {
  PrivateJtcConfig,
  PrivateJtcEmojisConfig,
} from "../../../config/private-jtc/private-jtc.config.js";
import { formatEmoji, resolveButtonEmoji } from "./private-emoji-helper.js";

export const UNTRUST_PAGE_SIZE = 25;

export interface TrustedUserDisplay {
  id: string;
  tag: string;
}

/**
 * Builds the interactive interface message for private voice channels:
 * - Transparent embed matching Discord theme with vc_interface.png embedded.
 * - 3 rows of 4 buttons matching the grid order in vc_interface.png.
 * - Buttons have emojis only, no text labels.
 */
export const buildPrivateInterfaceMessage = (
  config: PrivateJtcConfig,
  client?: Client | null,
): BaseMessageOptions => {
  const resolvedImagePath = path.isAbsolute(config.interfaceImagePath)
    ? config.interfaceImagePath
    : path.resolve(process.cwd(), config.interfaceImagePath);

  const files: AttachmentBuilder[] = [];
  if (fs.existsSync(resolvedImagePath)) {
    files.push(
      new AttachmentBuilder(resolvedImagePath, { name: "vc_interface.png" }),
    );
  }

  const embed = new EmbedBuilder()
    .setColor(config.embedColor)
    .setImage("attachment://vc_interface.png");

  const { emojis } = config;

  // Row 1: Rename, Limit, Lock, Unlock
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("pjtc:rename")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(resolveButtonEmoji("rename", emojis.rename, client)),
    new ButtonBuilder()
      .setCustomId("pjtc:limit")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(resolveButtonEmoji("limit", emojis.limit, client)),
    new ButtonBuilder()
      .setCustomId("pjtc:lock")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(resolveButtonEmoji("lock", emojis.lock, client)),
    new ButtonBuilder()
      .setCustomId("pjtc:unlock")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(resolveButtonEmoji("unlock", emojis.unlock, client)),
  );

  // Row 2: Hide, Unhide, Chat, Trust
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("pjtc:hide")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(resolveButtonEmoji("hide", emojis.hide, client)),
    new ButtonBuilder()
      .setCustomId("pjtc:unhide")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(resolveButtonEmoji("unhide", emojis.unhide, client)),
    new ButtonBuilder()
      .setCustomId("pjtc:chat")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(resolveButtonEmoji("chat", emojis.chat, client)),
    new ButtonBuilder()
      .setCustomId("pjtc:trust")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(resolveButtonEmoji("trust", emojis.trust, client)),
  );

  // Row 3: Untrust, Transfer, Invite, Kick
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("pjtc:untrust")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(resolveButtonEmoji("untrust", emojis.untrust, client)),
    new ButtonBuilder()
      .setCustomId("pjtc:transfer")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(resolveButtonEmoji("transfer", emojis.transfer, client)),
    new ButtonBuilder()
      .setCustomId("pjtc:invite")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(resolveButtonEmoji("invite", emojis.invite, client)),
    new ButtonBuilder()
      .setCustomId("pjtc:kick")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(resolveButtonEmoji("kick", emojis.kick, client)),
  );

  return {
    embeds: [embed],
    files,
    components: [row1, row2, row3],
  };
};

export interface UntrustPaginationPayload {
  content: string;
  components: ActionRowBuilder<any>[];
}

/**
 * Builds the paginated untrust menu payload to support arbitrarily large trusted lists (> 25 or 40 users).
 */
export const buildUntrustPaginationPayload = (
  channelId: string,
  trustedUsers: TrustedUserDisplay[],
  page = 1,
  emojis: PrivateJtcEmojisConfig,
  client?: Client | null,
): UntrustPaginationPayload => {
  if (trustedUsers.length === 0) {
    return {
      content: `${formatEmoji("cross", emojis.cross, client)} No members are currently trusted in this room.`,
      components: [],
    };
  }

  const totalPages = Math.max(
    1,
    Math.ceil(trustedUsers.length / UNTRUST_PAGE_SIZE),
  );
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const startIndex = (currentPage - 1) * UNTRUST_PAGE_SIZE;
  const pageUsers = trustedUsers.slice(
    startIndex,
    startIndex + UNTRUST_PAGE_SIZE,
  );

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`pjtc:untrust_select:${channelId}`)
    .setPlaceholder(
      `Select user(s) to untrust (Page ${currentPage}/${totalPages})`,
    )
    .setMinValues(1)
    .setMaxValues(pageUsers.length)
    .setOptions(
      pageUsers.map((user) => ({
        label: user.tag.slice(0, 100),
        value: user.id,
        description: `ID: ${user.id}`,
      })),
    );

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    selectMenu,
  );

  const components: ActionRowBuilder<any>[] = [selectRow];

  if (totalPages > 1) {
    const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`pjtc:untrust_page:${channelId}:${currentPage - 1}`)
        .setLabel("◀ Previous")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage <= 1),
      new ButtonBuilder()
        .setCustomId("pjtc:page_indicator")
        .setLabel(`${currentPage} / ${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`pjtc:untrust_page:${channelId}:${currentPage + 1}`)
        .setLabel("Next ▶")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= totalPages),
    );
    components.push(navRow);
  }

  return {
    content: `${formatEmoji("untrust", emojis.untrust, client)} Select member(s) to untrust (Total: ${trustedUsers.length} trusted, Page ${currentPage}/${totalPages}):`,
    components,
  };
};
