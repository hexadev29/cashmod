export interface PrivateJtcUserPresence {
  userId: string;
  joinedAt: string; // ISO 8601 string
}

export interface PrivateJtcRoomSettings {
  userLimit?: number;
  locked?: boolean;
  hidden?: boolean;
  chatDisabled?: boolean;
}

export interface PrivateJtcRoomRecord {
  channelId: string;
  guildId: string;
  categoryId: string;
  ownerId: string;
  originalOwnerId: string;
  isTransferred: boolean;
  createdAt: string; // ISO 8601 string
  joinHistory: PrivateJtcUserPresence[];
  trustedUserIds: string[];
  interfaceMessageId?: string;
  settings?: PrivateJtcRoomSettings;
}

export interface PrivateJtcState {
  categoryId?: string;
  rooms: Record<string, PrivateJtcRoomRecord>;
}
