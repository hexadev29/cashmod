import { describe, it, expect } from "vitest";
import {
  validateConfig,
  ConfigValidationError,
} from "../../../src/core/config/validate-config.js";
import type { AppConfig } from "../../../src/core/config/config-types.js";
import { JTC_CATEGORY_ORDER } from "../../../config/jtc/jtc.config.js";

const createValidConfig = (): AppConfig => ({
  env: {
    nodeEnv: "test",
    token: "valid.discord.token_12345678901234567890",
  },
  discord: {
    guildId: "123456789012345678",
    clientOptions: { intents: [] },
  },
  permissions: {
    policies: {
      everyone: { allow: [], deny: [] },
      roomOwner: { allow: [], deny: [] },
    },
  },
  jtc: {
    categoryOrder: JTC_CATEGORY_ORDER,
    categories: {
      Solo: { name: "Solo", categoryId: "111111111111111111", userLimit: 1 },
      Duo: { name: "Duo", categoryId: "222222222222222222", userLimit: 2 },
      Trio: { name: "Trio", categoryId: "333333333333333333", userLimit: 3 },
      Quad: { name: "Quad", categoryId: "444444444444444444", userLimit: 4 },
      Penta: { name: "Penta", categoryId: "555555555555555555", userLimit: 5 },
      Hexa: { name: "Hexa", categoryId: "666666666666666666", userLimit: 6 },
      Septa: { name: "Septa", categoryId: "777777777777777777", userLimit: 7 },
      Octa: { name: "Octa", categoryId: "888888888888888888", userLimit: 8 },
    },
    triggers: {
      "100000000000000001": {
        triggerChannelId: "100000000000000001",
        categoryName: "Solo",
        roomNameTemplate: "Solo #{number}",
        userLimit: 1,
      },
    },
    namingRegex: /^(Solo|Duo|Trio|Quad|Penta|Hexa|Septa|Octa)\s+#(\d+)$/i,
    positioning: {},
    cleanup: {
      delayMs: 10,
      recheckEmpty: true,
      maxRetries: 2,
      retryDelayMs: 10,
    },
    permissions: { ownerPolicyKey: "roomOwner", everyonePolicyKey: "everyone" },
  },
  diagnostics: {
    logLevel: "info",
    enableColors: false,
    debugMode: false,
    showBanner: false,
  },
});

describe("validateConfig", () => {
  it("passes for a valid configuration", () => {
    const config = createValidConfig();
    expect(() => validateConfig(config)).not.toThrow();
  });

  it("fails when token is empty or missing", () => {
    const config = createValidConfig();
    config.env.token = "";
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    try {
      validateConfig(config);
    } catch (err: any) {
      expect(err.errors.some((e: any) => e.field === "env.token")).toBe(true);
    }
  });

  it("fails when guildId is not a valid snowflake", () => {
    const config = createValidConfig();
    config.discord.guildId = "invalid-id";
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
  });

  it("fails when category order is modified or missing categories", () => {
    const config = createValidConfig();
    config.jtc.categoryOrder = ["Duo", "Solo"] as any;
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
  });

  it("fails when duplicate category IDs are present", () => {
    const config = createValidConfig();
    config.jtc.categories.Duo.categoryId =
      config.jtc.categories.Solo.categoryId;
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
  });

  it("fails when trigger roomNameTemplate does not include {number}", () => {
    const config = createValidConfig();
    config.jtc.triggers["100000000000000001"].roomNameTemplate = "Solo Room";
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
  });
});
