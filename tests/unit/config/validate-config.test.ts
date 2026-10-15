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
    activity: {
      name: "CA Study Hub",
      type: 2,
    },
    clientOptions: { intents: [] },
  },
  permissions: {
    policies: {
      everyone: { allow: [], deny: [] },
      roomOwner: { allow: [], deny: [] },
    },
  },
  jtc: {
    anchorCategoryId: "123456789012345679",
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
      "100000000000000001": {
        triggerChannelId: "100000000000000001",
        categoryName: "Solo",
        roomNameTemplate: "Solo #{number}",
        userLimit: 1,
      },
    },
    namingRegex: /^(Solo|Duo|Trio|Quad|Penta|HEPTA|Septa|Octa)\s+#(\d+)$/i,
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

  it("fails when anchorCategoryId is missing or not a valid snowflake", () => {
    const config = createValidConfig();
    config.jtc.anchorCategoryId = "bad-anchor";
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    try {
      validateConfig(config);
    } catch (err: any) {
      expect(
        err.errors.some((e: any) => e.field === "jtc.anchorCategoryId"),
      ).toBe(true);
    }
  });

  it("fails when category order is modified or missing categories", () => {
    const config = createValidConfig();
    config.jtc.categoryOrder = ["Duo", "Solo"] as any;
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
  });

  it("fails when trigger roomNameTemplate does not include {number}", () => {
    const config = createValidConfig();
    config.jtc.triggers["100000000000000001"].roomNameTemplate = "Solo Room";
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
  });

  it("fails when discord.activity.name is empty", () => {
    const config = createValidConfig();
    config.discord.activity.name = "   ";
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
  });

  it("fails when permissions role ID is not a valid snowflake", () => {
    const config = createValidConfig();
    config.permissions.roles = {
      quarantineRoleId: "not-a-snowflake",
    };
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
  });
});
