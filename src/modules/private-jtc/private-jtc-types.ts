export interface PrivateJtcUserPresence {
  userId: string;
  joinedAt: string; // ISO 8601 string
}

export interface PrivateJtcRoomRecord {
  channelId: string;
  guildId: string;
  categoryId: string;
  ownerId: string;
  createdAt: string; // ISO 8601 string
  joinHistory: PrivateJtcUserPresence[];
}

export interface PrivateJtcState {
  categoryId?: string;
  rooms: Record<string, PrivateJtcRoomRecord>;
}
