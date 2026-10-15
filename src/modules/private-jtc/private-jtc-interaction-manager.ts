import {
  ActionRowBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  type Interaction,
  type VoiceChannel,
} from "discord.js";
import type {
  PrivateJtcConfig,
  PrivateJtcEmojisConfig,
} from "../../../config/private-jtc/private-jtc.config.js";
import type { PrivateJtcService } from "./private-jtc-service.js";
import {
  buildUntrustPaginationPayload,
  buildUnblockPaginationPayload,
} from "./private-interface-builder.js";
import { formatEmoji } from "./private-emoji-helper.js";
import { logger } from "../../diagnostics/logger.js";

export class PrivateJtcInteractionManager {
  private readonly log = logger.child({
    subsystem: "PrivateJtcInteractionManager",
  });

  constructor(
    private readonly config: PrivateJtcConfig,
    private readonly service: PrivateJtcService,
  ) {}

  private emoji(
    name: keyof PrivateJtcEmojisConfig,
    interaction?: Interaction | any,
  ): string {
    return formatEmoji(name, this.config.emojis[name], interaction?.client);
  }

  /**
   * Determines if the interaction belongs to Private JTC controls.
   */
  public isPrivateJtcInteraction(interaction: Interaction): boolean {
    const customId =
      "customId" in interaction ? (interaction.customId as string) : "";
    return customId.startsWith("pjtc:");
  }

  /**
   * Main entrypoint to handle all Private JTC interactions (buttons, modals, select menus).
   */
  public async handleInteraction(interaction: Interaction): Promise<void> {
    const customId =
      "customId" in interaction ? (interaction.customId as string) : "";

    const channel = interaction.channel as VoiceChannel | null;
    if (!channel || !channel.isVoiceBased()) {
      if ("reply" in interaction && typeof interaction.reply === "function") {
        await interaction.reply({
          content: `${this.emoji("cross", interaction)} This control can only be used inside a private voice room.`,
          ephemeral: true,
        });
      }
      return;
    }

    const record = this.service.getManagedRoom(channel.id);
    if (!record) {
      if ("reply" in interaction && typeof interaction.reply === "function") {
        await interaction.reply({
          content: `${this.emoji("cross", interaction)} This voice room is no longer managed by Cash Mod.`,
          ephemeral: true,
        });
      }
      return;
    }

    // Owner authorization check: Only active room owner can use controls
    if (interaction.user.id !== record.ownerId) {
      if ("reply" in interaction && typeof interaction.reply === "function") {
        await interaction.reply({
          content: `${this.emoji("cross", interaction)} Only the room owner (<@${record.ownerId}>) can use these controls.`,
          ephemeral: true,
        });
      }
      return;
    }

    try {
      if (interaction.isButton()) {
        await this.handleButtonInteraction(interaction, channel, record);
        return;
      }

      if (interaction.isModalSubmit()) {
        await this.handleModalSubmit(interaction, channel);
        return;
      }

      if (interaction.isUserSelectMenu()) {
        await this.handleUserSelect(interaction, channel);
        return;
      }

      if (interaction.isStringSelectMenu()) {
        await this.handleStringSelect(interaction, channel);
        return;
      }
    } catch (err: any) {
      this.log.error(
        `Error handling interaction ${customId} for user ${interaction.user.id}: ${err?.message}`,
        undefined,
        err,
      );
      if ("reply" in interaction && typeof interaction.reply === "function") {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: `${this.emoji("cross", interaction)} An unexpected error occurred while processing your request.`,
            ephemeral: true,
          });
        }
      }
    }
  }

  // ==========================================
  // BUTTONS
  // ==========================================
  private async handleButtonInteraction(
    interaction: any,
    channel: VoiceChannel,
    record: any,
  ): Promise<void> {
    const customId: string = interaction.customId;

    switch (customId) {
      case "pjtc:rename": {
        const modal = new ModalBuilder()
          .setCustomId("pjtc:modal_rename")
          .setTitle("Rename Voice Channel");

        const input = new TextInputBuilder()
          .setCustomId("name_input")
          .setLabel("New Channel Name")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setMinLength(1)
          .setValue(channel.name)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(input),
        );
        await interaction.showModal(modal);
        return;
      }

      case "pjtc:limit": {
        const modal = new ModalBuilder()
          .setCustomId("pjtc:modal_limit")
          .setTitle("Set User Limit");

        const input = new TextInputBuilder()
          .setCustomId("limit_input")
          .setLabel("User Limit (0-99, 0 = Unlimited)")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(2)
          .setMinLength(1)
          .setValue(String(channel.userLimit ?? 0))
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(input),
        );
        await interaction.showModal(modal);
        return;
      }

      case "pjtc:lock": {
        await this.service.lockRoom(channel, interaction.user.id);
        await interaction.reply({
          content: `${this.emoji("lock", interaction)} Channel locked! Only trusted members can connect.`,
          ephemeral: true,
        });
        return;
      }

      case "pjtc:unlock": {
        await this.service.unlockRoom(channel, interaction.user.id);
        await interaction.reply({
          content: `${this.emoji("unlock", interaction)} Channel unlocked! Anyone can connect.`,
          ephemeral: true,
        });
        return;
      }

      case "pjtc:hide": {
        await this.service.hideRoom(channel, interaction.user.id);
        await interaction.reply({
          content: `${this.emoji("hide", interaction)} Channel hidden! Only trusted members and occupants can see this room.`,
          ephemeral: true,
        });
        return;
      }

      case "pjtc:unhide": {
        await this.service.unhideRoom(channel, interaction.user.id);
        await interaction.reply({
          content: `${this.emoji("unhide", interaction)} Channel unhidden! Everyone can view this room.`,
          ephemeral: true,
        });
        return;
      }

      case "pjtc:chat": {
        const disabled = await this.service.toggleChat(
          channel,
          interaction.user.id,
        );
        await interaction.reply({
          content: `${this.emoji("chat", interaction)} Voice text chat has been **${disabled ? "disabled" : "enabled"}**.`,
          ephemeral: true,
        });
        return;
      }

      case "pjtc:trust": {
        const select = new UserSelectMenuBuilder()
          .setCustomId("pjtc:trust_select")
          .setPlaceholder("Select user(s) to trust...")
          .setMinValues(1)
          .setMaxValues(10);

        const row = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
          select,
        );

        await interaction.reply({
          content: `${this.emoji("trust", interaction)} Select user(s) to trust in this room:`,
          components: [row],
          ephemeral: true,
        });
        return;
      }

      case "pjtc:untrust": {
        const trustedIds = record.trustedUserIds ?? [];
        const displays = await Promise.all(
          trustedIds.map(async (id: string) => {
            const member = await channel.guild.members
              .fetch(id)
              .catch(() => null);
            return {
              id,
              tag: member?.user?.tag ?? `User (${id})`,
            };
          }),
        );

        const payload = buildUntrustPaginationPayload(
          channel.id,
          displays,
          1,
          this.config.emojis,
          interaction.client,
        );
        await interaction.reply({
          content: payload.content,
          components: payload.components,
          ephemeral: true,
        });
        return;
      }

      case "pjtc:transfer": {
        const select = new UserSelectMenuBuilder()
          .setCustomId("pjtc:transfer_select")
          .setPlaceholder("Select a user to transfer ownership to...")
          .setMinValues(1)
          .setMaxValues(1);

        const row = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
          select,
        );

        await interaction.reply({
          content: `${this.emoji("transfer", interaction)} Select a user to transfer ownership to:`,
          components: [row],
          ephemeral: true,
        });
        return;
      }

      case "pjtc:invite": {
        try {
          const invite = await channel.createInvite({
            maxAge: 86400,
            maxUses: 10,
            unique: true,
            reason: "Private JTC owner invite button",
          });
          await interaction.reply({
            content: `${this.emoji("invite", interaction)} Here is an invite link to your voice room:\n${invite.url}`,
            ephemeral: true,
          });
        } catch (invErr: any) {
          await interaction.reply({
            content: `${this.emoji("cross", interaction)} Failed to create invite link: ${invErr?.message}`,
            ephemeral: true,
          });
        }
        return;
      }

      case "pjtc:kick": {
        const occupants = channel.members.filter(
          (m) => m.id !== interaction.user.id,
        );

        if (occupants.size === 0) {
          await interaction.reply({
            content: `${this.emoji("cross", interaction)} There are no other members in this voice channel to kick.`,
            ephemeral: true,
          });
          return;
        }

        const select = new StringSelectMenuBuilder()
          .setCustomId("pjtc:kick_select")
          .setPlaceholder("Select a member to kick from voice...")
          .setMinValues(1)
          .setMaxValues(1)
          .setOptions(
            occupants.map((m) => ({
              label: m.user.tag.slice(0, 100),
              value: m.id,
              description: `ID: ${m.id}`,
            })),
          );

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          select,
        );

        await interaction.reply({
          content: `${this.emoji("kick", interaction)} Select an occupant to disconnect from this room:`,
          components: [row],
          ephemeral: true,
        });
        return;
      }

      case "pjtc:block": {
        const select = new UserSelectMenuBuilder()
          .setCustomId("pjtc:block_select")
          .setPlaceholder("Select user(s) to block...")
          .setMinValues(1)
          .setMaxValues(10);

        const row = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
          select,
        );

        await interaction.reply({
          content: `${this.emoji("block", interaction)} Select user(s) to block from this room (they will not be able to join even when the room is public):`,
          components: [row],
          ephemeral: true,
        });
        return;
      }

      case "pjtc:unblock": {
        const blockedIds = record.blockedUserIds ?? [];
        const displays = await Promise.all(
          blockedIds.map(async (id: string) => {
            const member = await channel.guild.members
              .fetch(id)
              .catch(() => null);
            return {
              id,
              tag: member?.user?.tag ?? `User (${id})`,
            };
          }),
        );

        const payload = buildUnblockPaginationPayload(
          channel.id,
          displays,
          1,
          this.config.emojis,
          interaction.client,
        );
        await interaction.reply({
          content: payload.content,
          components: payload.components,
          ephemeral: true,
        });
        return;
      }
    }

    // Untrust pagination button navigation: pjtc:untrust_page:<channelId>:<page>
    if (customId.startsWith("pjtc:untrust_page:")) {
      const parts = customId.split(":");
      const targetPage = parseInt(parts[3], 10) || 1;

      const trustedIds = record.trustedUserIds ?? [];
      const displays = await Promise.all(
        trustedIds.map(async (id: string) => {
          const member = await channel.guild.members.fetch(id).catch(() => null);
          return {
            id,
            tag: member?.user?.tag ?? `User (${id})`,
          };
        }),
      );

      const payload = buildUntrustPaginationPayload(
        channel.id,
        displays,
        targetPage,
        this.config.emojis,
        interaction.client,
      );
      await interaction.update({
        content: payload.content,
        components: payload.components,
      });
      return;
    }

    // Unblock pagination button navigation: pjtc:unblock_page:<channelId>:<page>
    if (customId.startsWith("pjtc:unblock_page:")) {
      const parts = customId.split(":");
      const targetPage = parseInt(parts[3], 10) || 1;

      const blockedIds = record.blockedUserIds ?? [];
      const displays = await Promise.all(
        blockedIds.map(async (id: string) => {
          const member = await channel.guild.members.fetch(id).catch(() => null);
          return {
            id,
            tag: member?.user?.tag ?? `User (${id})`,
          };
        }),
      );

      const payload = buildUnblockPaginationPayload(
        channel.id,
        displays,
        targetPage,
        this.config.emojis,
        interaction.client,
      );
      await interaction.update({
        content: payload.content,
        components: payload.components,
      });
      return;
    }
  }

  // ==========================================
  // MODAL SUBMISSIONS
  // ==========================================
  private async handleModalSubmit(
    interaction: any,
    channel: VoiceChannel,
  ): Promise<void> {
    const customId: string = interaction.customId;

    if (customId === "pjtc:modal_rename") {
      const newName = interaction.fields.getTextInputValue("name_input");
      const ok = await this.service.renameRoom(
        channel,
        newName,
        interaction.user.id,
      );
      if (ok) {
        await interaction.reply({
          content: `${this.emoji("success", interaction)} Channel renamed to **${newName.trim()}**.`,
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: `${this.emoji("cross", interaction)} Failed to rename channel.`,
          ephemeral: true,
        });
      }
      return;
    }

    if (customId === "pjtc:modal_limit") {
      const rawLimit = interaction.fields.getTextInputValue("limit_input");
      const limit = parseInt(rawLimit.trim(), 10);

      if (isNaN(limit) || limit < 0 || limit > 99) {
        await interaction.reply({
          content: `${this.emoji("cross", interaction)} Please enter a valid number between 0 and 99.`,
          ephemeral: true,
        });
        return;
      }

      await this.service.setRoomLimit(channel, limit, interaction.user.id);
      await interaction.reply({
        content: `${this.emoji("success", interaction)} User limit set to **${limit === 0 ? "Unlimited" : limit}**.`,
        ephemeral: true,
      });
    }
  }

  // ==========================================
  // USER SELECT MENUS
  // ==========================================
  private async handleUserSelect(
    interaction: any,
    channel: VoiceChannel,
  ): Promise<void> {
    const customId: string = interaction.customId;

    if (customId === "pjtc:trust_select") {
      const selectedUserIds: string[] = interaction.values;
      const added = await this.service.trustUsers(
        channel,
        selectedUserIds,
        interaction.user.id,
      );
      await interaction.reply({
        content: `${this.emoji("success", interaction)} Successfully trusted **${added.length}** member(s).`,
        ephemeral: true,
      });
      return;
    }

    if (customId === "pjtc:block_select") {
      const selectedUserIds: string[] = interaction.values;
      const added = await this.service.blockUsers(
        channel,
        selectedUserIds,
        interaction.user.id,
      );
      await interaction.reply({
        content: `${this.emoji("success", interaction)} Successfully blocked **${added.length}** member(s). They will not be able to join this room.`,
        ephemeral: true,
      });
      return;
    }

    if (customId === "pjtc:transfer_select") {
      const newOwnerId = interaction.values[0];
      if (newOwnerId === interaction.user.id) {
        await interaction.reply({
          content: `${this.emoji("cross", interaction)} You are already the owner of this room.`,
          ephemeral: true,
        });
        return;
      }

      const ok = await this.service.transferOwnership(channel, newOwnerId);
      if (ok) {
        await interaction.reply({
          content: `${this.emoji("transfer", interaction)} Transferred ownership of this room to <@${newOwnerId}>.`,
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: `${this.emoji("cross", interaction)} Failed to transfer ownership.`,
          ephemeral: true,
        });
      }
    }
  }

  // ==========================================
  // STRING SELECT MENUS
  // ==========================================
  private async handleStringSelect(
    interaction: any,
    channel: VoiceChannel,
  ): Promise<void> {
    const customId: string = interaction.customId;

    if (customId.startsWith("pjtc:untrust_select")) {
      const selectedUserIds: string[] = interaction.values;
      const removed = await this.service.untrustUsers(
        channel,
        selectedUserIds,
        interaction.user.id,
      );
      await interaction.reply({
        content: `${this.emoji("success", interaction)} Successfully untrusted **${removed.length}** member(s).`,
        ephemeral: true,
      });
      return;
    }

    if (customId.startsWith("pjtc:unblock_select")) {
      const selectedUserIds: string[] = interaction.values;
      const removed = await this.service.unblockUsers(
        channel,
        selectedUserIds,
        interaction.user.id,
      );
      await interaction.reply({
        content: `${this.emoji("success", interaction)} Successfully unblocked **${removed.length}** member(s).`,
        ephemeral: true,
      });
      return;
    }

    if (customId === "pjtc:kick_select") {
      const targetUserId = interaction.values[0];
      const ok = await this.service.kickMember(
        channel,
        targetUserId,
        interaction.user.id,
      );
      if (ok) {
        await interaction.reply({
          content: `${this.emoji("kick", interaction)} Successfully disconnected <@${targetUserId}> from the room.`,
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: `${this.emoji("cross", interaction)} Failed to kick member from voice.`,
          ephemeral: true,
        });
      }
    }
  }
}
