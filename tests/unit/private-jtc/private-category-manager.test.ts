import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ChannelType, Collection, type CategoryChannel, type Guild } from "discord.js";
import { PrivateCategoryManager } from "../../../src/modules/private-jtc/private-category-manager.js";
import { PrivateJtcStateStore } from "../../../src/modules/private-jtc/private-jtc-state-store.js";
import type { PrivateJtcConfig } from "../../../config/private-jtc/private-jtc.config.js";
import path from "node:path";
import fs from "node:fs";

describe("PrivateCategoryManager — Dynamic Positioning & Lifecycle", () => {
  const guildId = "123456789012345678";
  const anchorCategoryId = "123456789012345679";
  const testStatePath = path.resolve(
    process.cwd(),
    "data/test-private-cat-manager.json",
  );

  const mockConfig: PrivateJtcConfig = {
    anchorCategoryId,
    triggerChannelId: "100000000000000005",
    categoryName: "Private Rooms",
    roomNameTemplate: "{username}'s Room",
    ownershipTransferDelayMs: 15 * 60 * 1000,
    stateFilePath: testStatePath,
    cleanup: {
      delayMs: 0,
      recheckEmpty: false,
      maxRetries: 2,
      retryDelayMs: 0,
    },
    queue: {
      concurrency: 1,
      minTaskDelayMs: 0,
      maxQueueSize: 100,
      taskTimeoutMs: 15000,
      enableEmptyRoomRecycling: false,
    },
  };

  let stateStore: PrivateJtcStateStore;
  let manager: PrivateCategoryManager;

  beforeEach(async () => {
    if (fs.existsSync(testStatePath)) {
      await fs.promises.unlink(testStatePath).catch(() => {});
    }
    stateStore = new PrivateJtcStateStore(testStatePath);
    manager = new PrivateCategoryManager(mockConfig, stateStore);
  });

  afterEach(async () => {
    if (fs.existsSync(testStatePath)) {
      await fs.promises.unlink(testStatePath).catch(() => {});
    }
  });

  const createMockCategory = (opts: {
    id: string;
    name: string;
    position: number;
    guild?: any;
  }): CategoryChannel => {
    const cat: any = {
      id: opts.id,
      name: opts.name,
      type: ChannelType.GuildCategory,
      position: opts.position,
      guild: opts.guild,
      delete: vi.fn().mockImplementation(async () => {
        opts.guild?.channels?.cache?.delete(opts.id);
        return cat;
      }),
      setPosition: vi.fn().mockImplementation(async (pos: number) => {
        cat.position = pos;
        return cat;
      }),
    };
    return cat as unknown as CategoryChannel;
  };

  const createMockGuild = (channelsMap: Map<string, any> = new Map()): Guild => {
    const guildObj: any = {
      id: guildId,
      name: "Test Guild",
    };

    guildObj.channels = {
      cache: channelsMap,
      fetch: vi.fn().mockImplementation(async (id?: string) => {
        if (!id) return new Collection(channelsMap.entries());
        return channelsMap.get(id) ?? null;
      }),
      create: vi.fn().mockImplementation(async (data: any) => {
        const id = `cat-created-${Date.now()}`;
        const newCat = createMockCategory({
          id,
          name: data.name,
          position: data.position ?? 0,
          guild: guildObj,
        });
        channelsMap.set(id, newCat);
        return newCat;
      }),
      setPositions: vi.fn().mockImplementation(async (updates: any[]) => {
        for (const u of updates) {
          const ch = channelsMap.get(u.channel);
          if (ch) ch.position = u.position;
        }
        return guildObj;
      }),
    };

    return guildObj as unknown as Guild;
  };

  it("creates dynamic category directly beneath anchor category (anchor.position + 1) and sets position", async () => {
    const channels = new Map<string, any>();
    const anchor = createMockCategory({
      id: anchorCategoryId,
      name: "━━━━ PRIVATE VC ━━━━",
      position: 3,
    });
    channels.set(anchorCategoryId, anchor);

    const guild = createMockGuild(channels);

    const createdId = await manager.getOrCreateCategory(guild);
    expect(createdId).toBeDefined();

    const createdCat = channels.get(createdId);
    expect(createdCat).toBeDefined();
    expect(createdCat.name).toBe("Private Rooms");
    // Position must be anchor.position + 1 = 4
    expect(createdCat.position).toBe(4);
    expect(createdCat.setPosition).toHaveBeenCalledWith(4, expect.any(Object));

    // Persisted to state
    const saved = await stateStore.loadState(guildId, anchorCategoryId);
    expect(saved?.categoryId).toBe(createdId);
  });

  it("adopts existing category if already present in guild and realigns position if displaced", async () => {
    const channels = new Map<string, any>();
    const anchor = createMockCategory({
      id: anchorCategoryId,
      name: "━━━━ PRIVATE VC ━━━━",
      position: 2,
    });
    channels.set(anchorCategoryId, anchor);

    // Existing "Private Rooms" category located at wrong position (e.g., 8)
    const existingCat = createMockCategory({
      id: "cat-existing-private",
      name: "Private Rooms",
      position: 8,
    });
    channels.set(existingCat.id, existingCat);

    const guild = createMockGuild(channels);

    const resolvedId = await manager.getOrCreateCategory(guild);
    expect(resolvedId).toBe("cat-existing-private");
    // Should have realigned to anchor.position + 1 = 3
    expect(existingCat.position).toBe(3);
    expect(existingCat.setPosition).toHaveBeenCalledWith(3, expect.any(Object));
  });

  it("realigns displaced category during initFromState", async () => {
    const channels = new Map<string, any>();
    const anchor = createMockCategory({
      id: anchorCategoryId,
      name: "━━━━ PRIVATE VC ━━━━",
      position: 5,
    });
    channels.set(anchorCategoryId, anchor);

    const existingCat = createMockCategory({
      id: "cat-saved-private",
      name: "Private Rooms",
      position: 1, // out of place!
    });
    channels.set(existingCat.id, existingCat);

    // Seed state store
    await stateStore.saveState(guildId, anchorCategoryId, {
      categoryId: existingCat.id,
      rooms: {},
    });

    const guild = createMockGuild(channels);
    await manager.initFromState(guild);

    expect(manager.getCategoryId()).toBe("cat-saved-private");
    // Must be realigned to 5 + 1 = 6
    expect(existingCat.position).toBe(6);
    expect(existingCat.setPosition).toHaveBeenCalledWith(6, expect.any(Object));
  });

  it("does not call setPosition if category is already at anchor.position + 1", async () => {
    const channels = new Map<string, any>();
    const anchor = createMockCategory({
      id: anchorCategoryId,
      name: "━━━━ PRIVATE VC ━━━━",
      position: 2,
    });
    channels.set(anchorCategoryId, anchor);

    const existingCat = createMockCategory({
      id: "cat-saved-private",
      name: "Private Rooms",
      position: 3, // exactly anchor.position + 1
    });
    channels.set(existingCat.id, existingCat);

    await stateStore.saveState(guildId, anchorCategoryId, {
      categoryId: existingCat.id,
      rooms: {},
    });

    const guild = createMockGuild(channels);
    await manager.initFromState(guild);

    expect(existingCat.setPosition).not.toHaveBeenCalled();
  });

  it("throws actionable error if anchor category is missing", async () => {
    const channels = new Map<string, any>();
    const guild = createMockGuild(channels);

    await expect(manager.getOrCreateCategory(guild)).rejects.toThrow(
      `Private anchor category ${anchorCategoryId} not found`,
    );
  });

  it("deletes empty category and cleans up persisted categoryId", async () => {
    const channels = new Map<string, any>();
    const anchor = createMockCategory({
      id: anchorCategoryId,
      name: "━━━━ PRIVATE VC ━━━━",
      position: 1,
    });
    channels.set(anchorCategoryId, anchor);

    const guild = createMockGuild(channels);
    const catId = await manager.getOrCreateCategory(guild);

    expect(manager.getCategoryId()).toBe(catId);

    // 0 voice channels inside category => deleteCategoryIfEmpty returns true
    const deleted = await manager.deleteCategoryIfEmpty(guild);
    expect(deleted).toBe(true);
    expect(manager.getCategoryId()).toBeNull();

    const saved = await stateStore.loadState(guildId, anchorCategoryId);
    expect(saved?.categoryId).toBeUndefined();
  });
});
