import { describe, it, expect, beforeEach } from "vitest";
import {
  loadConfig,
  clearConfigCache,
} from "../../../src/core/config/load-config.js";

describe("loadConfig", () => {
  beforeEach(() => {
    clearConfigCache();
  });

  it("loads anchor category ID and triggers from environment variables", () => {
    const customEnv: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      DISCORD_TOKEN: "valid.discord.token_12345678901234567890",
      DISCORD_GUILD_ID: "1466470318628536446",
      JTC_ANCHOR_CATEGORY_ID: "1481621773266059355",
      JTC_TRIGGER_SOLO_ID: "148162180000000001",
      JTC_TRIGGER_DUO_ID: "148162180000000002",
      JTC_TRIGGER_TRIO_ID: "148162180000000003",
      JTC_TRIGGER_QUAD_ID: "148162180000000004",
      JTC_TRIGGER_PENTA_ID: "148162180000000005",
      JTC_TRIGGER_HEPTA_ID: "148162180000000006",
      JTC_TRIGGER_SEPTA_ID: "148162180000000007",
      JTC_TRIGGER_OCTA_ID: "148162180000000008",
    };

    const config = loadConfig(customEnv);

    expect(config.discord.guildId).toBe("1466470318628536446");
    expect(config.jtc.anchorCategoryId).toBe("1481621773266059355");
    expect(config.jtc.triggers["148162180000000001"]).toBeDefined();
    expect(config.jtc.triggers["148162180000000001"].triggerChannelId).toBe(
      "148162180000000001",
    );
    expect(config.jtc.triggers["148162180000000001"].categoryName).toBe("Solo");

    expect(config.jtc.triggers["148162180000000006"]).toBeDefined();
    expect(config.jtc.triggers["148162180000000006"].categoryName).toBe(
      "Hepta",
    );
  });
});
