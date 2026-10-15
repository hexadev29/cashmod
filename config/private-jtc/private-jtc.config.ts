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
  block: string;
  unblock: string;
}

export const defaultPrivateJtcEmojis: PrivateJtcEmojisConfig = {
  untrust: "1560263550407286816",
  unlock: "1560263547529994322",
  unhide: "1560263525065171054",
  trust: "1560263542421069915",
  transfer: "1560263540164796426",
  success: "1560263538138677418",
  rename: "1560263535852920914",
  lock: "1560263533487333447",
  limit: "1560263531364880494",
  kick: "1560263529188167680",
  invite: "1560263527183290449",
  hide: "1560263545311068292",
  cross: "1560263522972340264",
  chat: "1560263520803758120",
  block: "1560263522972340264",
  unblock: "1560329416268058674",
};

import type { JtcCleanupConfig, JtcQueueConfig } from "../jtc/jtc.config.js";

export interface PrivateJtcConfig {
  categoryId: string;
  anchorCategoryId?: string;
  triggerChannelId: string;
  categoryName: string;
  roomNameTemplate: string;
  ownershipTransferDelayMs: number;
  stateFilePath: string;
  interfaceImagePath: string;
  embedColor: number;
  emojis: PrivateJtcEmojisConfig;
  cleanup?: JtcCleanupConfig;
  queue?: JtcQueueConfig;
}

export const buildPrivateJtcConfig = (
  env: NodeJS.ProcessEnv = process.env,
): PrivateJtcConfig => {
  const privateCategoryId =
    env.JTC_PRIVATE_CATEGORY_ID ??
    env.JTC_PRIVATE_ANCHOR_CATEGORY_ID ??
    "223456789012345679";

  return {
    categoryId: privateCategoryId,
    anchorCategoryId: privateCategoryId,
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
    cleanup: {
      delayMs: env.JTC_PRIVATE_CLEANUP_DELAY_MS
        ? parseInt(env.JTC_PRIVATE_CLEANUP_DELAY_MS, 10)
        : 1000,
      recheckEmpty: true,
      maxRetries: 3,
      retryDelayMs: 500,
    },
    queue: {
      concurrency: 1,
      minTaskDelayMs: env.JTC_PRIVATE_QUEUE_DELAY_MS
        ? parseInt(env.JTC_PRIVATE_QUEUE_DELAY_MS, 10)
        : 250,
      maxQueueSize: 100,
      taskTimeoutMs: 15000,
      enableEmptyRoomRecycling: false,
    },
    emojis: { ...defaultPrivateJtcEmojis },
  };
};

export const privateJtcConfig: PrivateJtcConfig = buildPrivateJtcConfig();
