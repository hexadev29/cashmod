import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChannelType, Collection, type Guild } from "discord.js";
import { PrivateCategoryManager } from "../../../src/modules/private-jtc/private-category-manager.js";
import type { PrivateJtcConfig } from "../../../config/private-jtc/private-jtc.config.js";

describe("PrivateCategoryManager (Predefined Category)", () => {
  const guildId = "123456789012345678";
  const privateCategoryId = "1486990152877477968";

  const mockConfig: PrivateJtcConfig = {
    categoryId: privateCategoryId,
    triggerChannelId: "100000000000000005",
    categoryName: "Private Rooms",
    roomNameTemplate: "{username}'s Room",
    ownershipTransferDelayMs: 15 * 60 * 1000,
    stateFilePath: "data/test-private-cat.json",
    interfaceImagePath: "assets/vc_interface.png",
    embedColor: 0x2b2d31,
    emojis: {} as any,
  };

  let manager: PrivateCategoryManager;
  let channelsMap: Map<string, any>;

  beforeEach(() => {
    manager = new PrivateCategoryManager(mockConfig);
    channelsMap = new Map();

    channelsMap.set(privateCategoryId, {
      id: privateCategoryId,
      name: "Private Rooms",
      type: ChannelType.GuildCategory,
    });
  });

  const createMockGuild = (): Guild => {
    return {
      id: guildId,
      name: "Test Guild",
      channels: {
        cache: channelsMap,
        fetch: vi.fn().mockImplementation(async (id?: string) => {
          if (!id) return new Collection(channelsMap.entries());
          return channelsMap.get(id) ?? null;
        }),
      },
    } as unknown as Guild;
  };

  it("returns configured predefined category ID and checks managed category", () => {
    expect(manager.getCategoryId()).toBe(privateCategoryId);
    expect(manager.isManagedCategory(privateCategoryId)).toBe(true);
    expect(manager.isManagedCategory("unknown-cat-id")).toBe(false);
  });

  it("verifies category exists in Discord upon initFromState without creating channels", async () => {
    const guild = createMockGuild();
    await manager.initFromState(guild);

    expect(guild.channels.fetch).toHaveBeenCalled();
  });

  it("resolves the predefined category ID via getOrCreateCategory", async () => {
    const guild = createMockGuild();
    const resolved = await manager.getOrCreateCategory(guild);

    expect(resolved).toBe(privateCategoryId);
  });

  it("realignCategory is a safe no-op", async () => {
    const guild = createMockGuild();
    await expect(manager.realignCategory(guild)).resolves.not.toThrow();
  });

  it("deleteCategoryIfEmpty returns false (predefined categories are never deleted)", async () => {
    const guild = createMockGuild();
    const result = await manager.deleteCategoryIfEmpty(guild);

    expect(result).toBe(false);
    expect(manager.getCategoryId()).toBe(privateCategoryId);
  });
});
