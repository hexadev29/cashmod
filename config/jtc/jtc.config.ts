export type JtcCategoryName = "Solo" | "Duo" | "Trio" | "Quad";

export const JTC_CATEGORY_ORDER: readonly JtcCategoryName[] = [
  "Solo",
  "Duo",
  "Trio",
  "Quad",
] as const;

export interface JtcCategoryDefinition {
  name: JtcCategoryName;
  userLimit: number;
}

export interface JtcTriggerConfig {
  triggerChannelId: string;
  categoryName: JtcCategoryName;
  roomNameTemplate: string; // e.g. "Solo #{number}"
  userLimit: number;
  bitrate?: number;
}

export interface JtcPositioningConfig {
  sortDescending?: boolean;
}

export interface JtcCleanupConfig {
  delayMs: number;
  recheckEmpty: boolean;
  maxRetries: number;
  retryDelayMs: number;
}

export interface JtcPermissionsMapping {
  everyonePolicyKey: "everyone";
  quarantinePolicyKey?: "quarantine";
  superFocusPolicyKey?: "superFocus";
  vcRestrictedPolicyKey?: "vcRestricted";
  enableOwnerPermissions?: boolean;
  ownerPolicyKey?: "roomOwner";
}

export interface JtcQueueConfig {
  concurrency: number;
  minTaskDelayMs: number;
  maxQueueSize: number;
  taskTimeoutMs: number;
  enableEmptyRoomRecycling: boolean;
}

export interface JtcConfig {
  anchorCategoryId: string;
  categoryOrder: readonly JtcCategoryName[];
  categories: Record<JtcCategoryName, JtcCategoryDefinition>;
  triggers: Record<string, JtcTriggerConfig>;
  namingRegex: RegExp;
  positioning: JtcPositioningConfig;
  cleanup: JtcCleanupConfig;
  queue: JtcQueueConfig;
  permissions: JtcPermissionsMapping;
}

export const buildJtcConfig = (
  env: NodeJS.ProcessEnv = process.env,
): JtcConfig => {
  const soloTrigger = env.JTC_TRIGGER_SOLO_ID ?? "100000000000000001";
  const duoTrigger = env.JTC_TRIGGER_DUO_ID ?? "100000000000000002";
  const trioTrigger = env.JTC_TRIGGER_TRIO_ID ?? "100000000000000003";
  const quadTrigger = env.JTC_TRIGGER_QUAD_ID ?? "100000000000000004";

  return {
    anchorCategoryId: env.JTC_ANCHOR_CATEGORY_ID ?? "123456789012345679",
    categoryOrder: JTC_CATEGORY_ORDER,
    categories: {
      Solo: { name: "Solo", userLimit: 1 },
      Duo: { name: "Duo", userLimit: 2 },
      Trio: { name: "Trio", userLimit: 3 },
      Quad: { name: "Quad", userLimit: 4 },
    },
    triggers: {
      [soloTrigger]: {
        triggerChannelId: soloTrigger,
        categoryName: "Solo",
        roomNameTemplate: "Solo #{number}",
        userLimit: 1,
      },
      [duoTrigger]: {
        triggerChannelId: duoTrigger,
        categoryName: "Duo",
        roomNameTemplate: "Duo #{number}",
        userLimit: 2,
      },
      [trioTrigger]: {
        triggerChannelId: trioTrigger,
        categoryName: "Trio",
        roomNameTemplate: "Trio #{number}",
        userLimit: 3,
      },
      [quadTrigger]: {
        triggerChannelId: quadTrigger,
        categoryName: "Quad",
        roomNameTemplate: "Quad #{number}",
        userLimit: 4,
      },
    },
    namingRegex: /^(Solo|Duo|Trio|Quad)\s+#(\d+)$/i,
    positioning: {
      sortDescending: false,
    },
    cleanup: {
      delayMs: 300,
      recheckEmpty: true,
      maxRetries: 3,
      retryDelayMs: 500,
    },
    queue: {
      concurrency: 1,
      minTaskDelayMs: 50,
      maxQueueSize: 100,
      taskTimeoutMs: 15000,
      enableEmptyRoomRecycling: true,
    },
    permissions: {
      everyonePolicyKey: "everyone",
      quarantinePolicyKey: "quarantine",
      superFocusPolicyKey: "superFocus",
      vcRestrictedPolicyKey: "vcRestricted",
      enableOwnerPermissions: false,
      ownerPolicyKey: "roomOwner",
    },
  };
};

export const jtcConfig: JtcConfig = buildJtcConfig();
