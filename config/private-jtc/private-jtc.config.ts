export interface PrivateJtcConfig {
  anchorCategoryId: string;
  triggerChannelId: string;
  categoryName: string;
  roomNameTemplate: string;
  ownershipTransferDelayMs: number;
  stateFilePath: string;
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
  };
};

export const privateJtcConfig: PrivateJtcConfig = buildPrivateJtcConfig();
