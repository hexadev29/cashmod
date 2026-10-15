export type JtcCategoryName =
  "Solo" | "Duo" | "Trio" | "Quad" | "Penta" | "Hexa" | "Septa" | "Octa";

export const JTC_CATEGORY_ORDER: readonly JtcCategoryName[] = [
  "Solo",
  "Duo",
  "Trio",
  "Quad",
  "Penta",
  "Hexa",
  "Septa",
  "Octa",
] as const;

export interface JtcCategoryConfig {
  name: JtcCategoryName;
  categoryId: string;
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
  anchorCategoryId?: string;
  sortDescending?: boolean;
}

export interface JtcCleanupConfig {
  delayMs: number;
  recheckEmpty: boolean;
  maxRetries: number;
  retryDelayMs: number;
}

export interface JtcPermissionsMapping {
  ownerPolicyKey: "roomOwner";
  everyonePolicyKey: "everyone";
}

export interface JtcConfig {
  categoryOrder: readonly JtcCategoryName[];
  categories: Record<JtcCategoryName, JtcCategoryConfig>;
  triggers: Record<string, JtcTriggerConfig>;
  namingRegex: RegExp;
  positioning: JtcPositioningConfig;
  cleanup: JtcCleanupConfig;
  permissions: JtcPermissionsMapping;
}

export const jtcConfig: JtcConfig = {
  categoryOrder: JTC_CATEGORY_ORDER,
  categories: {
    Solo: {
      name: "Solo",
      categoryId: process.env.JTC_CATEGORY_SOLO_ID ?? "111111111111111111",
      userLimit: 1,
    },
    Duo: {
      name: "Duo",
      categoryId: process.env.JTC_CATEGORY_DUO_ID ?? "222222222222222222",
      userLimit: 2,
    },
    Trio: {
      name: "Trio",
      categoryId: process.env.JTC_CATEGORY_TRIO_ID ?? "333333333333333333",
      userLimit: 3,
    },
    Quad: {
      name: "Quad",
      categoryId: process.env.JTC_CATEGORY_QUAD_ID ?? "444444444444444444",
      userLimit: 4,
    },
    Penta: {
      name: "Penta",
      categoryId: process.env.JTC_CATEGORY_PENTA_ID ?? "555555555555555555",
      userLimit: 5,
    },
    Hexa: {
      name: "Hexa",
      categoryId: process.env.JTC_CATEGORY_HEXA_ID ?? "666666666666666666",
      userLimit: 6,
    },
    Septa: {
      name: "Septa",
      categoryId: process.env.JTC_CATEGORY_SEPTA_ID ?? "777777777777777777",
      userLimit: 7,
    },
    Octa: {
      name: "Octa",
      categoryId: process.env.JTC_CATEGORY_OCTA_ID ?? "888888888888888888",
      userLimit: 8,
    },
  },
  triggers: {
    // Configured triggers keyed by trigger voice channel ID
    [process.env.JTC_TRIGGER_SOLO_ID ?? "100000000000000001"]: {
      triggerChannelId: process.env.JTC_TRIGGER_SOLO_ID ?? "100000000000000001",
      categoryName: "Solo",
      roomNameTemplate: "Solo #{number}",
      userLimit: 1,
    },
    [process.env.JTC_TRIGGER_DUO_ID ?? "100000000000000002"]: {
      triggerChannelId: process.env.JTC_TRIGGER_DUO_ID ?? "100000000000000002",
      categoryName: "Duo",
      roomNameTemplate: "Duo #{number}",
      userLimit: 2,
    },
    [process.env.JTC_TRIGGER_TRIO_ID ?? "100000000000000003"]: {
      triggerChannelId: process.env.JTC_TRIGGER_TRIO_ID ?? "100000000000000003",
      categoryName: "Trio",
      roomNameTemplate: "Trio #{number}",
      userLimit: 3,
    },
    [process.env.JTC_TRIGGER_QUAD_ID ?? "100000000000000004"]: {
      triggerChannelId: process.env.JTC_TRIGGER_QUAD_ID ?? "100000000000000004",
      categoryName: "Quad",
      roomNameTemplate: "Quad #{number}",
      userLimit: 4,
    },
    [process.env.JTC_TRIGGER_PENTA_ID ?? "100000000000000005"]: {
      triggerChannelId:
        process.env.JTC_TRIGGER_PENTA_ID ?? "100000000000000005",
      categoryName: "Penta",
      roomNameTemplate: "Penta #{number}",
      userLimit: 5,
    },
    [process.env.JTC_TRIGGER_HEXA_ID ?? "100000000000000006"]: {
      triggerChannelId: process.env.JTC_TRIGGER_HEXA_ID ?? "100000000000000006",
      categoryName: "Hexa",
      roomNameTemplate: "Hexa #{number}",
      userLimit: 6,
    },
    [process.env.JTC_TRIGGER_SEPTA_ID ?? "100000000000000007"]: {
      triggerChannelId:
        process.env.JTC_TRIGGER_SEPTA_ID ?? "100000000000000007",
      categoryName: "Septa",
      roomNameTemplate: "Septa #{number}",
      userLimit: 7,
    },
    [process.env.JTC_TRIGGER_OCTA_ID ?? "100000000000000008"]: {
      triggerChannelId: process.env.JTC_TRIGGER_OCTA_ID ?? "100000000000000008",
      categoryName: "Octa",
      roomNameTemplate: "Octa #{number}",
      userLimit: 8,
    },
  },
  namingRegex: /^(Solo|Duo|Trio|Quad|Penta|Hexa|Septa|Octa)\s+#(\d+)$/i,
  positioning: {
    sortDescending: false,
  },
  cleanup: {
    delayMs: 300,
    recheckEmpty: true,
    maxRetries: 3,
    retryDelayMs: 500,
  },
  permissions: {
    ownerPolicyKey: "roomOwner",
    everyonePolicyKey: "everyone",
  },
};
