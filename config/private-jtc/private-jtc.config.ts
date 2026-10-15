export interface PrivateJtcEmojisConfig {
  untrust: string;
  unlock: string;
  unhide: string;
  trust: string;
  transfer: string;
  success: string;
  rename: string;
  lock: string;
  limit: string;
  kick: string;
  invite: string;
  hide: string;
  cross: string;
  chat: string;
}

export const defaultPrivateJtcEmojis: PrivateJtcEmojisConfig = {
  untrust: "1560263550407286816",
  unlock: "1560263547529994322",
  unhide: "1560263545311068292",
  trust: "1560263542421069915",
  transfer: "1560263540164796426",
  success: "1560263538138677418",
  rename: "1560263535852920914",
  lock: "1560263533487333447",
  limit: "1560263531364880494",
  kick: "1560263529188167680",
  invite: "1560263527183290449",
  hide: "1560263525065171054",
  cross: "1560263522972340264",
  chat: "1560263520803758120",
};

export interface PrivateJtcConfig {
  anchorCategoryId: string;
  triggerChannelId: string;
  categoryName: string;
  roomNameTemplate: string;
  ownershipTransferDelayMs: number;
  stateFilePath: string;
  interfaceImagePath: string;
  embedColor: number;
  emojis: PrivateJtcEmojisConfig;
}

export const buildPrivateJtcConfig = (
  env: NodeJS.ProcessEnv = process.env,
): PrivateJtcConfig => {
  return {
    anchorCategoryId:
      env.JTC_PRIVATE_ANCHOR_CATEGORY_ID ?? "223456789012345679",
    triggerChannelId: env.JTC_PRIVATE_TRIGGER_ID ?? "200000000000000001",
    categoryName: env.JTC_PRIVATE_CATEGORY_NAME ?? "Private Rooms",
    roomNameTemplate: env.JTC_PRIVATE_ROOM_NAME_TEMPLATE ?? "{username}'s Room",
    ownershipTransferDelayMs: env.JTC_PRIVATE_TRANSFER_DELAY_MS
      ? parseInt(env.JTC_PRIVATE_TRANSFER_DELAY_MS, 10)
      : 15 * 60 * 1000, // 15 minutes default
    stateFilePath:
      env.JTC_PRIVATE_STATE_FILE_PATH ?? "data/private-jtc-state.json",
    interfaceImagePath:
      env.JTC_PRIVATE_INTERFACE_IMAGE_PATH ?? "assets/vc_interface.png",
    embedColor: env.JTC_PRIVATE_EMBED_COLOR
      ? parseInt(env.JTC_PRIVATE_EMBED_COLOR, 16)
      : 0x2b2d31,
    emojis: {
      untrust: env.EMOJI_UNTRUST_ID ?? defaultPrivateJtcEmojis.untrust,
      unlock: env.EMOJI_UNLOCK_ID ?? defaultPrivateJtcEmojis.unlock,
      unhide: env.EMOJI_UNHIDE_ID ?? defaultPrivateJtcEmojis.unhide,
      trust: env.EMOJI_TRUST_ID ?? defaultPrivateJtcEmojis.trust,
      transfer: env.EMOJI_TRANSFER_ID ?? defaultPrivateJtcEmojis.transfer,
      success: env.EMOJI_SUCCESS_ID ?? defaultPrivateJtcEmojis.success,
      rename: env.EMOJI_RENAME_ID ?? defaultPrivateJtcEmojis.rename,
      lock: env.EMOJI_LOCK_ID ?? defaultPrivateJtcEmojis.lock,
      limit: env.EMOJI_LIMIT_ID ?? defaultPrivateJtcEmojis.limit,
      kick: env.EMOJI_KICK_ID ?? defaultPrivateJtcEmojis.kick,
      invite: env.EMOJI_INVITE_ID ?? defaultPrivateJtcEmojis.invite,
      hide: env.EMOJI_HIDE_ID ?? defaultPrivateJtcEmojis.hide,
      cross: env.EMOJI_CROSS_ID ?? defaultPrivateJtcEmojis.cross,
      chat: env.EMOJI_CHAT_ID ?? defaultPrivateJtcEmojis.chat,
    },
  };
};

export const privateJtcConfig: PrivateJtcConfig = buildPrivateJtcConfig();
