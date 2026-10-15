export type JtcCategoryName =
  "Solo" | "Duo" | "Trio" | "Quad" | "Penta" | "Hepta" | "Septa" | "Octa";

export const JTC_CATEGORY_ORDER: readonly JtcCategoryName[] = [
  "Solo",
  "Duo",
  "Trio",
  "Quad",
  "Penta",
  "Hepta",
  "Septa",
  "Octa",
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
  ownerPolicyKey: "roomOwner";
  everyonePolicyKey: "everyone";
}

export interface JtcConfig {
  anchorCategoryId: string;
  categoryOrder: readonly JtcCategoryName[];
  categories: Record<JtcCategoryName, JtcCategoryDefinition>;
  triggers: Record<string, JtcTriggerConfig>;
  namingRegex: RegExp;
  positioning: JtcPositioningConfig;
  cleanup: JtcCleanupConfig;
  permissions: JtcPermissionsMapping;
}

export const buildJtcConfig = (
  env: NodeJS.ProcessEnv = process.env,
): JtcConfig => {
  const soloTrigger = env.JTC_TRIGGER_SOLO_ID ?? "100000000000000001";
  const duoTrigger = env.JTC_TRIGGER_DUO_ID ?? "100000000000000002";
  const trioTrigger = env.JTC_TRIGGER_TRIO_ID ?? "100000000000000003";
  const quadTrigger = env.JTC_TRIGGER_QUAD_ID ?? "100000000000000004";
  const pentaTrigger = env.JTC_TRIGGER_PENTA_ID ?? "100000000000000005";
  const heptaTrigger = env.JTC_TRIGGER_HEPTA_ID ?? "100000000000000006";
  const septaTrigger = env.JTC_TRIGGER_SEPTA_ID ?? "100000000000000007";
  const octaTrigger = env.JTC_TRIGGER_OCTA_ID ?? "100000000000000008";

  return {
    anchorCategoryId: env.JTC_ANCHOR_CATEGORY_ID ?? "123456789012345679",
    categoryOrder: JTC_CATEGORY_ORDER,
    categories: {
      Solo: { name: "Solo", userLimit: 1 },
      Duo: { name: "Duo", userLimit: 2 },
      Trio: { name: "Trio", userLimit: 3 },
      Quad: { name: "Quad", userLimit: 4 },
      Penta: { name: "Penta", userLimit: 5 },
      Hepta: { name: "Hepta", userLimit: 6 },
      Septa: { name: "Septa", userLimit: 7 },
      Octa: { name: "Octa", userLimit: 8 },
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
      [pentaTrigger]: {
        triggerChannelId: pentaTrigger,
        categoryName: "Penta",
        roomNameTemplate: "Penta #{number}",
        userLimit: 5,
      },
      [heptaTrigger]: {
        triggerChannelId: heptaTrigger,
        categoryName: "Hepta",
        roomNameTemplate: "Hepta #{number}",
        userLimit: 6,
      },
      [septaTrigger]: {
        triggerChannelId: septaTrigger,
        categoryName: "Septa",
        roomNameTemplate: "Septa #{number}",
        userLimit: 7,
      },
      [octaTrigger]: {
        triggerChannelId: octaTrigger,
        categoryName: "Octa",
        roomNameTemplate: "Octa #{number}",
        userLimit: 8,
      },
    },
    namingRegex: /^(Solo|Duo|Trio|Quad|Penta|Hepta|Septa|Octa)\s+#(\d+)$/i,
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
};

export const jtcConfig: JtcConfig = buildJtcConfig();
