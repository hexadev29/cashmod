export interface PrivateJtcUserPresence {
  userId: string;
  joinedAt: string; // ISO 8601 string
}

export interface PrivateJtcRoomSettings {
  name?: string;
  userLimit?: number;
  locked?: boolean;
  hidden?: boolean;
  chatDisabled?: boolean;
}

export interface PrivateJtcUserProfile {
  customName?: string;
  userLimit?: number;
  locked?: boolean;
  hidden?: boolean;
  chatDisabled?: boolean;
  trustedUserIds?: string[];
  blockedUserIds?: string[];
  updatedAt?: string;
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
  blockedUserIds?: string[];
  interfaceMessageId?: string;
  settings?: PrivateJtcRoomSettings;
}

export interface PrivateJtcState {
  categoryId?: string;
  rooms: Record<string, PrivateJtcRoomRecord>;
  userProfiles?: Record<string, PrivateJtcUserProfile>;
}
