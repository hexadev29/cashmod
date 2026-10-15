import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChannelType, type Guild } from "discord.js";
import { CategoryManager } from "../../../src/modules/jtc/category-manager.js";
import { jtcConfig } from "../../../config/jtc/jtc.config.js";

describe("CategoryManager (Predefined Categories)", () => {
  let manager: CategoryManager;

  const guildId = "123456789012345678";
  const soloCatId = "1481621773266059301";
  const duoCatId = "1481621773266059302";
  const trioCatId = "1481621773266059303";
  const quadCatId = "1481621773266059304";

  let mockChannels: Map<string, any>;

  const mockConfig = {
    ...jtcConfig,
    categories: {
      Solo: { name: "Solo" as const, categoryId: soloCatId, userLimit: 1 },
      Duo: { name: "Duo" as const, categoryId: duoCatId, userLimit: 2 },
      Trio: { name: "Trio" as const, categoryId: trioCatId, userLimit: 3 },
      Quad: { name: "Quad" as const, categoryId: quadCatId, userLimit: 4 },
    },
  };

  beforeEach(() => {
    manager = new CategoryManager(mockConfig);
    mockChannels = new Map();

    mockChannels.set(soloCatId, {
      id: soloCatId,
      name: "Solo VC",
      type: ChannelType.GuildCategory,
    });
    mockChannels.set(duoCatId, {
      id: duoCatId,
      name: "Duo VC",
      type: ChannelType.GuildCategory,
    });
    mockChannels.set(trioCatId, {
      id: trioCatId,
      name: "Trio VC",
      type: ChannelType.GuildCategory,
    });
    mockChannels.set(quadCatId, {
      id: quadCatId,
      name: "Quad VC",
      type: ChannelType.GuildCategory,
    });
  });

  const createMockGuild = (): Guild => {
    return {
      id: guildId,
      name: "Test Guild",
      channels: {
        cache: mockChannels,
        fetch: vi.fn().mockImplementation(async (id?: string) => {
          if (id) {
            return mockChannels.get(id) ?? null;
          }
          return mockChannels;
        }),
      },
    } as unknown as Guild;
  };

  it("populates category mappings from predefined config immediately upon construction", () => {
    expect(manager.getCategoryId("Solo")).toBe(soloCatId);
    expect(manager.getCategoryId("Duo")).toBe(duoCatId);
    expect(manager.getCategoryId("Trio")).toBe(trioCatId);
    expect(manager.getCategoryId("Quad")).toBe(quadCatId);
    expect(manager.hasCategory("Solo")).toBe(true);
    expect(manager.getAllManagedCategoryIds()).toEqual([
      soloCatId,
      duoCatId,
      trioCatId,
      quadCatId,
    ]);
  });

  it("identifies managed category IDs and maps IDs back to category names", () => {
    expect(manager.isManagedCategory(soloCatId)).toBe(true);
    expect(manager.isManagedCategory(duoCatId)).toBe(true);
    expect(manager.isManagedCategory("unmanaged-id")).toBe(false);

    expect(manager.getCategoryNameById(soloCatId)).toBe("Solo");
    expect(manager.getCategoryNameById(duoCatId)).toBe("Duo");
    expect(manager.getCategoryNameById("unmanaged-id")).toBeUndefined();
  });

  it("verifies categories exist in Discord upon initFromState without creating any channels", async () => {
    const guild = createMockGuild();
    await manager.initFromState(guild);

    expect(manager.isInitialized()).toBe(true);
    expect(guild.channels.fetch).toHaveBeenCalled();
  });

  it("resolves the predefined category ID via getOrCreateCategory", async () => {
    const guild = createMockGuild();
    const resolvedSolo = await manager.getOrCreateCategory(guild, "Solo");
    const resolvedDuo = await manager.getOrCreateCategory(guild, "Duo");

    expect(resolvedSolo).toBe(soloCatId);
    expect(resolvedDuo).toBe(duoCatId);
  });

  it("never deletes predefined categories when deleteCategoryIfEmpty is called", async () => {
    const guild = createMockGuild();
    const deleted = await manager.deleteCategoryIfEmpty(guild, soloCatId);

    expect(deleted).toBe(false);
    expect(manager.hasCategory("Solo")).toBe(true);
  });

  it("realignManagedCategories is a safe no-op", async () => {
    const guild = createMockGuild();
    await expect(manager.realignManagedCategories(guild)).resolves.not.toThrow();
  });
});
