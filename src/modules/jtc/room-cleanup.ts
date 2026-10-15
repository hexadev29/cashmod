import type { VoiceChannel } from "discord.js";
import type { JtcCleanupConfig } from "../../../config/jtc/jtc.config.js";
import { logger } from "../../diagnostics/logger.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class RoomCleanupHandler {
  private log = logger.child({ subsystem: "JtcCleanup" });
  private readonly cancelledChannels = new Set<string>();

  constructor(private readonly config: JtcCleanupConfig) {}

  /**
   * Cancels any pending or delayed cleanup for the specified channel ID.
   * Call this when a room is recycled/adopted by a new join before it is deleted.
   */
  public cancelPendingCleanup(channelId: string): boolean {
    this.cancelledChannels.add(channelId);
    this.log.debug(`Cancelled pending cleanup for channel ${channelId}`);
    return true;
  }

  /**
   * Safely cleans up an empty JTC voice channel after verifying it remains empty.
   */
  public async cleanupChannel(
    channel: VoiceChannel,
    isEligibleCallback: (ch: VoiceChannel) => boolean,
  ): Promise<boolean> {
    if (!channel || channel.deletable === false) {
      this.log.debug(
        `Channel ${channel?.id ?? "unknown"} is not deletable or missing.`,
      );
      return false;
    }

    if (this.cancelledChannels.has(channel.id)) {
      this.cancelledChannels.delete(channel.id);
      this.log.info(
        `Aborting cleanup for room "${channel.name}" (${channel.id}): room was adopted/recycled.`,
      );
      return false;
    }

    if (!isEligibleCallback(channel)) {
      this.log.debug(
        `Channel "${channel.name}" (${channel.id}) is not eligible for cleanup.`,
      );
      return false;
    }

    // Initial check: if members are still in the channel, do not delete
    if (channel.members.size > 0) {
      this.log.debug(
        `Channel "${channel.name}" has active members (${channel.members.size}); aborting cleanup.`,
      );
      return false;
    }

    const delayMs =
      this.config.delayMs ?? (this.config as any).emptyChannelDeleteDelayMs ?? 0;
    const maxRetries = this.config.maxRetries ?? 3;
    const retryDelayMs = this.config.retryDelayMs ?? 500;
    const recheckEmpty = this.config.recheckEmpty ?? false;

    // Delay before recheck
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    if (this.cancelledChannels.has(channel.id)) {
      this.cancelledChannels.delete(channel.id);
      this.log.info(
        `Aborting cleanup for room "${channel.name}" (${channel.id}) after delay: room was adopted/recycled.`,
      );
      return false;
    }

    // Recheck emptiness if configured
    if (recheckEmpty) {
      try {
        const freshChannel = (await channel.guild.channels.fetch(
          channel.id,
        )) as VoiceChannel | null;
        if (!freshChannel || (typeof (freshChannel as any).isVoiceBased === "function" ? !(freshChannel as any).isVoiceBased() : false)) {
          this.log.debug(`Channel ${channel.id} was already removed.`);
          return true;
        }

        if (freshChannel.members.size > 0) {
          this.log.debug(
            `Channel "${freshChannel.name}" gained members during delay (${freshChannel.members.size}); aborting cleanup.`,
          );
          return false;
        }
      } catch (fetchErr: any) {
        if (fetchErr?.code === 10003) {
          // Unknown Channel - already deleted
          return true;
        }
        this.log.warn(
          `Failed to re-fetch channel ${channel.id} before cleanup: ${fetchErr?.message}`,
        );
      }
    }

    // Attempt deletion with bounded retries
    let attempts = 0;
    while (attempts <= maxRetries) {
      try {
        await channel.delete("Cash Mod JTC empty room cleanup");
        this.log.info(
          `Deleted empty JTC room: "${channel.name}" (${channel.id})`,
        );
        return true;
      } catch (err: any) {
        if (err?.code === 10003) {
          // Channel already deleted
          return true;
        }

        attempts++;
        if (attempts > maxRetries) {
          this.log.error(
            `Exhausted retries deleting empty channel "${channel.name}" (${channel.id}): ${err?.message}`,
            { channelId: channel.id, attempts },
            err,
          );
          return false;
        }

        this.log.warn(
          `Retry ${attempts}/${maxRetries} deleting channel "${channel.name}" (${channel.id}) after error: ${err?.message}`,
        );
        await sleep(retryDelayMs);
      }
    }

    return false;
  }
}
