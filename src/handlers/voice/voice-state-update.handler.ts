import type { VoiceState, VoiceChannel } from "discord.js";
import type { EventHandler } from "../loader/loader-types.js";
import { getJtcService } from "../../modules/jtc/jtc-instance.js";
import { getPrivateJtcService } from "../../modules/private-jtc/private-jtc-instance.js";
import { loadConfig } from "../../core/config/load-config.js";
import { logger } from "../../diagnostics/logger.js";

const log = logger.child({ subsystem: "VoiceStateUpdateHandler" });

export const voiceStateUpdateHandler: EventHandler<"voiceStateUpdate"> = {
  name: "voiceStateUpdate",
  event: "voiceStateUpdate",
  execute: async (oldState: VoiceState, newState: VoiceState) => {
    const config = loadConfig();

    // 1. Single guild enforcement: ignore events from other guilds
    if (
      newState.guild.id !== config.discord.guildId &&
      oldState.guild.id !== config.discord.guildId
    ) {
      return;
    }

    const member = newState.member ?? oldState.member;
    if (!member || member.user.bot) {
      return;
    }

    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;

    // Ignore transitions that do not change the channel (e.g., mute, deafen, camera toggle)
    if (oldChannelId === newChannelId) {
      return;
    }

    const jtcService = getJtcService();
    const privateJtcService = getPrivateJtcService();
    if (!jtcService) {
      log.warn(
        "Received voice state transition before JtcService was initialized; skipping.",
      );
      return;
    }

    // A. Handle leave or move from old channel
    if (oldChannelId && oldState.channel && oldState.channel.isVoiceBased()) {
      try {
        if (
          privateJtcService &&
          privateJtcService.isEligiblePrivateChannel(
            oldState.channel as VoiceChannel,
          )
        ) {
          await privateJtcService.queueVoiceLeave(
            oldState.channel as VoiceChannel,
            member,
          );
        } else if (
          jtcService.isManagedRoom(oldChannelId) ||
          jtcService.isEligibleJtcChannel(oldState.channel as VoiceChannel)
        ) {
          await jtcService.queueVoiceLeave(oldState.channel as VoiceChannel);
        }
      } catch (leaveErr: any) {
        log.error(
          `Error handling voice leave for channel ${oldChannelId}: ${leaveErr?.message}`,
          undefined,
          leaveErr,
        );
      }
    }

    // B. Handle join or move to new channel
    if (newChannelId && newState.channel) {
      try {
        if (
          privateJtcService &&
          config.privateJtc &&
          newChannelId === config.privateJtc.triggerChannelId
        ) {
          await privateJtcService.queueVoiceJoin(member, newChannelId);
        } else if (config.jtc.triggers[newChannelId]) {
          await jtcService.queueVoiceJoin(member, newChannelId);
        } else if (
          newState.channel.isVoiceBased() &&
          privateJtcService &&
          privateJtcService.isEligiblePrivateChannel(
            newState.channel as VoiceChannel,
          )
        ) {
          await privateJtcService.queueMemberJoin(
            member,
            newState.channel as VoiceChannel,
          );
        } else if (
          newState.channel.isVoiceBased() &&
          jtcService.isEligibleJtcChannel(newState.channel as VoiceChannel)
        ) {
          await jtcService.queueDirectJoin(
            member,
            newState.channel as VoiceChannel,
          );
        }
      } catch (joinErr: any) {
        log.error(
          `Error handling voice join for member ${member.id}: ${joinErr?.message}`,
          undefined,
          joinErr,
        );
      }
    }
  },
};

export default voiceStateUpdateHandler;
