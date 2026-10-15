import type { Guild, VoiceChannel } from "discord.js";
import type {
  JtcConfig,
  JtcCategoryName,
} from "../../../config/jtc/jtc.config.js";
import type { RoomCleanupHandler } from "./room-cleanup.js";
import type { CategoryManager } from "./category-manager.js";
import { logger } from "../../diagnostics/logger.js";

export interface ReconciliationResult {
  totalScanned: number;
  activeAdopted: number;
  emptyCleaned: number;
}

export const reconcileJtcRooms = async (
  guild: Guild,
  config: JtcConfig,
  categoryManager: CategoryManager,
  cleanupHandler: RoomCleanupHandler,
  registerAdoptedRoom: (
    channelId: string,
    categoryName: JtcCategoryName,
    roomNumber: number,
  ) => void,
): Promise<ReconciliationResult> => {
  const log = logger.child({ subsystem: "JtcReconciliation" });
  log.info(
    `Starting JTC startup reconciliation for guild: ${guild.name} (${guild.id})`,
  );

  let totalScanned = 0;
  let activeAdopted = 0;
  let emptyCleaned = 0;

  try {
    const channels = await guild.channels.fetch();

    for (const [, channel] of channels) {
      if (!channel || !channel.isVoiceBased() || channel.isDMBased()) continue;

      const parentId = channel.parentId;
      if (!parentId) continue;

      const categoryName = categoryManager.getCategoryNameById(parentId);
      if (!categoryName) continue;

      // Check if channel name matches naming regex
      const match = config.namingRegex.exec(channel.name);
      if (!match) continue;

      totalScanned++;
      const voiceChannel = channel as VoiceChannel;

      if (voiceChannel.members.size === 0) {
        // Channel is empty; safely clean it up
        log.info(
          `Reconciliation found empty stale room "${voiceChannel.name}" (${voiceChannel.id}); cleaning up.`,
        );
        const cleaned = await cleanupHandler.cleanupChannel(
          voiceChannel,
          () => true,
        );
        if (cleaned) {
          emptyCleaned++;
        }
      } else {
        // Channel has active members; adopt it so it is cleaned when they leave
        const roomNumber = parseInt(match[2], 10);
        registerAdoptedRoom(
          voiceChannel.id,
          categoryName,
          isNaN(roomNumber) ? 1 : roomNumber,
        );
        activeAdopted++;
        log.debug(
          `Reconciliation adopted active room "${voiceChannel.name}" (${voiceChannel.id}) with ${voiceChannel.members.size} member(s)`,
        );
      }
    }
  } catch (err: any) {
    log.error(
      `Error during JTC reconciliation: ${err?.message}`,
      undefined,
      err,
    );
  }

  log.info(
    `Reconciliation complete: scanned ${totalScanned} room(s), adopted ${activeAdopted} active, cleaned ${emptyCleaned} empty.`,
  );

  return {
    totalScanned,
    activeAdopted,
    emptyCleaned,
  };
};
