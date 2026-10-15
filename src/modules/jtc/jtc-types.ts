import type { VoiceChannel } from "discord.js";
import type { JtcCategoryName } from "../../../config/jtc/jtc.config.js";

export interface ManagedRoomRecord {
  channelId: string;
  guildId: string;
  ownerId: string;
  categoryName: JtcCategoryName;
  roomNumber: number;
  createdAt: Date;
}

export interface RoomAllocationResult {
  channel: VoiceChannel;
  roomNumber: number;
  categoryName: JtcCategoryName;
}
