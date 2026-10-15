import { describe, it, expect } from "vitest";
import { formatEmoji, resolveButtonEmoji } from "../../../src/modules/private-jtc/private-emoji-helper.js";
import { Collection, type Client } from "discord.js";

describe("private-emoji-helper", () => {
  describe("formatEmoji", () => {
    it("formats raw snowflake ID with emoji name as <:name:id>", () => {
      const formatted = formatEmoji("success", "1560263538138677418");
      expect(formatted).toBe("<:success:1560263538138677418>");
    });

    it("preserves already formatted custom emoji tags", () => {
      expect(formatEmoji("lock", "<:lock:1560263533487333447>")).toBe(
        "<:lock:1560263533487333447>",
      );
      expect(formatEmoji("chat", "<a:animated_chat:1560263520803758120>")).toBe(
        "<a:animated_chat:1560263520803758120>",
      );
    });

    it("preserves unicode emojis", () => {
      expect(formatEmoji("success", "✅")).toBe("✅");
      expect(formatEmoji("cross", "❌")).toBe("❌");
    });

    it("resolves from client guild emojis cache if present", () => {
      const mockEmoji = {
        id: "1560263538138677418",
        name: "custom_success",
        animated: false,
        toString: () => "<:custom_success:1560263538138677418>",
      };
      const cache = new Collection<string, any>();
      cache.set("1560263538138677418", mockEmoji);

      const mockClient = {
        emojis: { cache },
      } as unknown as Client;

      expect(formatEmoji("success", "1560263538138677418", mockClient)).toBe(
        "<:custom_success:1560263538138677418>",
      );
    });

    it("resolves from client application emojis cache if present", () => {
      const mockAppEmoji = {
        id: "1560263520803758120",
        name: "app_chat",
        animated: true,
        toString: () => "<a:app_chat:1560263520803758120>",
      };
      const appCache = new Collection<string, any>();
      appCache.set("1560263520803758120", mockAppEmoji);

      const mockClient = {
        emojis: { cache: new Collection() },
        application: { emojis: { cache: appCache } },
      } as unknown as Client;

      expect(formatEmoji("chat", "1560263520803758120", mockClient)).toBe(
        "<a:app_chat:1560263520803758120>",
      );
    });
  });

  describe("resolveButtonEmoji", () => {
    it("returns { id, name } object for raw snowflake ID so Discord receives name", () => {
      const resolved = resolveButtonEmoji("rename", "1560263535852920914");
      expect(resolved).toEqual({
        id: "1560263535852920914",
        name: "rename",
      });
    });

    it("parses static emoji tag <:name:id>", () => {
      const resolved = resolveButtonEmoji("lock", "<:lock:1560263533487333447>");
      expect(resolved).toEqual({
        animated: false,
        name: "lock",
        id: "1560263533487333447",
      });
    });

    it("parses animated emoji tag <a:name:id>", () => {
      const resolved = resolveButtonEmoji("kick", "<a:kick_anim:1560263529188167680>");
      expect(resolved).toEqual({
        animated: true,
        name: "kick_anim",
        id: "1560263529188167680",
      });
    });

    it("resolves from client cache when client is provided", () => {
      const mockEmoji = {
        id: "1560263542421069915",
        name: "guild_trust",
        animated: false,
      };
      const cache = new Collection<string, any>();
      cache.set("1560263542421069915", mockEmoji);

      const mockClient = {
        emojis: { cache },
      } as unknown as Client;

      const resolved = resolveButtonEmoji("trust", "1560263542421069915", mockClient);
      expect(resolved).toEqual({
        id: "1560263542421069915",
        name: "guild_trust",
        animated: false,
      });
    });
  });
});
