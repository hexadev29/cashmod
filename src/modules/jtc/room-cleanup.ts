import type { VoiceChannel } from "discord.js";
import type { JtcCleanupConfig } from "../../../config/jtc/jtc.config.js";
import { logger } from "../../diagnostics/logger.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class RoomCleanupHandler {
  private log = logger.child({ subsystem: "JtcCleanup" });

  constructor(private readonly config: JtcCleanupConfig) {}

  /**
   * Safely cleans up an empty JTC voice channel after verifying it remains empty.
   */
  public async cleanupChannel(
    channel: VoiceChannel,
    isEligibleCallback: (ch: VoiceChannel) => boolean,
  ): Promise<boolean> {
    if (!channel || !channel.deletable) {
      this.log.debug(
        `Channel ${channel?.id ?? "unknown"} is not deletable or missing.`,
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

    // Delay before recheck
    if (this.config.delayMs > 0) {
      await sleep(this.config.delayMs);
    }

    // Recheck emptiness if configured
    if (this.config.recheckEmpty) {
      try {
        const freshChannel = (await channel.guild.channels.fetch(
          channel.id,
        )) as VoiceChannel | null;
        if (!freshChannel || !freshChannel.isVoiceBased()) {
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
    while (attempts <= this.config.maxRetries) {
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
        if (attempts > this.config.maxRetries) {
          this.log.error(
            `Exhausted retries deleting empty channel "${channel.name}" (${channel.id}): ${err?.message}`,
            { channelId: channel.id, attempts },
            err,
          );
          return false;
        }

        this.log.warn(
          `Retry ${attempts}/${this.config.maxRetries} deleting channel "${channel.name}" (${channel.id}) after error: ${err?.message}`,
        );
        await sleep(this.config.retryDelayMs);
      }
    }

    return false;
  }
}
