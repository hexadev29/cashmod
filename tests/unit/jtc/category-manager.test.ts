import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ChannelType, type Guild } from "discord.js";
import { CategoryManager } from "../../../src/modules/jtc/category-manager.js";
import { JtcStateStore } from "../../../src/modules/jtc/jtc-state-store.js";
import { jtcConfig } from "../../../config/jtc/jtc.config.js";

describe("CategoryManager", () => {
  const testDir = path.resolve(process.cwd(), "data/test-cat-state");
  const testFilePath = path.join(testDir, "jtc-categories.json");
  let stateStore: JtcStateStore;
  let manager: CategoryManager;

  const guildId = "123456789012345678";
  const anchorId = "123456789012345679";

  let mockChannels: Map<string, any>;
  let channelCounter: number;

  beforeEach(async () => {
    if (fs.existsSync(testDir)) {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }
    stateStore = new JtcStateStore(testFilePath);
    manager = new CategoryManager(
      { ...jtcConfig, anchorCategoryId: anchorId },
      stateStore,
    );

    mockChannels = new Map();
    channelCounter = 100;

    // Anchor Category channel
    mockChannels.set(anchorId, {
      id: anchorId,
      name: "━━ JOIN TO CREATE ━━",
      type: ChannelType.GuildCategory,
      position: 5,
    });
  });

  afterEach(async () => {
    if (fs.existsSync(testDir)) {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }
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
        create: vi.fn().mockImplementation(async (opts: any) => {
          channelCounter++;
          const newId = `cat-gen-${channelCounter}`;
          const newChannel = {
            id: newId,
            name: opts.name,
            type: opts.type,
            position: opts.position,
          };
          mockChannels.set(newId, newChannel);
          return newChannel;
        }),
      },
    } as unknown as Guild;
  };

  it("fresh installation starts uninitialized with no category IDs", () => {
    expect(manager.isInitialized()).toBe(false);
    expect(manager.getCategoryId("Solo")).toBeUndefined();
    expect(manager.getAllManagedCategoryIds()).toHaveLength(0);
  });

  it("initial step (initFromState) does not create any dynamic categories", async () => {
    const guild = createMockGuild();

    await manager.initFromState(guild);

    expect(manager.isInitialized()).toBe(true);
    // CRITICAL: 0 dynamic categories created in Discord on initial step
    expect((guild.channels.create as any).mock.calls.length).toBe(0);
    expect(manager.getAllManagedCategoryIds()).toHaveLength(0);
    expect(manager.getCategoryId("Solo")).toBeUndefined();
  });

  it("dynamically creates Solo category on demand below anchor and persists to disk", async () => {
    const guild = createMockGuild();
    await manager.initFromState(guild);

    const soloId = await manager.getOrCreateCategory(guild, "Solo");

    expect(soloId).toBeDefined();
    expect(manager.getCategoryId("Solo")).toBe(soloId);
    expect((guild.channels.create as any).mock.calls.length).toBe(1);

    const discordChannel = mockChannels.get(soloId);
    expect(discordChannel).toBeDefined();
    expect(discordChannel.name).toBe("Solo");
    // Positioned immediately below anchor (anchor is position 5, Solo index 0 => 5 + 1 + 0 = 6)
    expect(discordChannel.position).toBe(6);

    // Verify persisted to disk with only Solo
    expect(fs.existsSync(testFilePath)).toBe(true);
    const persisted = await stateStore.loadState(guildId, anchorId);
    expect(persisted).toEqual({ Solo: soloId });
  });

  it("subsequent joins for Solo reuse the existing category without re-creating", async () => {
    const guild = createMockGuild();
    await manager.initFromState(guild);

    const firstSoloId = await manager.getOrCreateCategory(guild, "Solo");
    expect((guild.channels.create as any).mock.calls.length).toBe(1);

    const secondSoloId = await manager.getOrCreateCategory(guild, "Solo");
    expect(secondSoloId).toBe(firstSoloId);
    // No additional channel creation
    expect((guild.channels.create as any).mock.calls.length).toBe(1);
  });

  it("creates Duo category on demand with correct position below Solo", async () => {
    const guild = createMockGuild();
    await manager.initFromState(guild);

    const soloId = await manager.getOrCreateCategory(guild, "Solo");
    const duoId = await manager.getOrCreateCategory(guild, "Duo");

    expect(soloId).not.toBe(duoId);
    expect((guild.channels.create as any).mock.calls.length).toBe(2);

    const duoChannel = mockChannels.get(duoId);
    expect(duoChannel.position).toBe(7); // 5 + 1 + 1 (Duo index is 1)

    // State file has both
    const persisted = await stateStore.loadState(guildId, anchorId);
    expect(persisted).toEqual({ Solo: soloId, Duo: duoId });
  });

  it("restarts reload previously created categories from disk without re-creating", async () => {
    const guild = createMockGuild();
    await manager.initFromState(guild);
    const soloId = await manager.getOrCreateCategory(guild, "Solo");

    // Simulate restart: new CategoryManager instance
    const newManager = new CategoryManager(
      { ...jtcConfig, anchorCategoryId: anchorId },
      stateStore,
    );
    await newManager.initFromState(guild);

    expect(newManager.getCategoryId("Solo")).toBe(soloId);
    // Joining Solo should reuse it without creating a new channel
    const reloadedSoloId = await newManager.getOrCreateCategory(guild, "Solo");
    expect(reloadedSoloId).toBe(soloId);
    // Exactly 1 creation across both instances
    expect((guild.channels.create as any).mock.calls.length).toBe(1);
  });

  it("re-creates category on demand if it was deleted in Discord", async () => {
    const guild = createMockGuild();
    await manager.initFromState(guild);
    const soloId = await manager.getOrCreateCategory(guild, "Solo");

    // Simulate user deleting Solo category in Discord
    mockChannels.delete(soloId);

    // Next time someone needs Solo, it dynamically re-creates it
    const newSoloId = await manager.getOrCreateCategory(guild, "Solo");
    expect(newSoloId).toBeDefined();
    expect(newSoloId).not.toBe(soloId);
    expect((guild.channels.create as any).mock.calls.length).toBe(2);
  });

  it("concurrent calls to getOrCreateCategory share execution and do not duplicate", async () => {
    const guild = createMockGuild();
    await manager.initFromState(guild);

    // 5 concurrent requests for Solo
    const [r1, r2, r3, r4, r5] = await Promise.all([
      manager.getOrCreateCategory(guild, "Solo"),
      manager.getOrCreateCategory(guild, "Solo"),
      manager.getOrCreateCategory(guild, "Solo"),
      manager.getOrCreateCategory(guild, "Solo"),
      manager.getOrCreateCategory(guild, "Solo"),
    ]);

    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
    expect(r3).toBe(r4);
    expect(r4).toBe(r5);
    // Only 1 category created
    expect((guild.channels.create as any).mock.calls.length).toBe(1);
  });

  it("fails safely if anchor category is missing when creating a category", async () => {
    mockChannels.delete(anchorId); // Anchor does not exist
    const guild = createMockGuild();
    await manager.initFromState(guild);

    await expect(manager.getOrCreateCategory(guild, "Solo")).rejects.toThrow(
      /Anchor category verification failed/,
    );
  });
});
