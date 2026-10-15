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
            isVoiceBased: () => opts.type === ChannelType.GuildVoice,
            delete: vi.fn().mockImplementation(async () => {
              mockChannels.delete(newId);
            }),
          };
          mockChannels.set(newId, newChannel);
          return newChannel;
        }),
        setPositions: vi.fn().mockImplementation(async (positions: any[]) => {
          for (const pos of positions) {
            const ch = mockChannels.get(pos.channel);
            if (ch) {
              ch.position = pos.position;
            }
          }
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

  it("deletes empty category and clears state when no voice channels remain", async () => {
    const guild = createMockGuild();
    await manager.initFromState(guild);
    const soloId = await manager.getOrCreateCategory(guild, "Solo");
    expect(manager.hasCategory("Solo")).toBe(true);

    const deleted = await manager.deleteCategoryIfEmpty(guild, soloId);
    expect(deleted).toBe(true);
    expect(manager.hasCategory("Solo")).toBe(false);
    expect(mockChannels.has(soloId)).toBe(false);
    // State file is cleared when 0 categories remain
    expect(fs.existsSync(testFilePath)).toBe(false);
  });

  it("does not delete category if active voice channels still remain in it", async () => {
    const guild = createMockGuild();
    await manager.initFromState(guild);
    const soloId = await manager.getOrCreateCategory(guild, "Solo");

    // Add an active voice room inside Solo category
    mockChannels.set("voice-room-1", {
      id: "voice-room-1",
      name: "Solo #1",
      type: ChannelType.GuildVoice,
      parentId: soloId,
      isVoiceBased: () => true,
    });

    const deleted = await manager.deleteCategoryIfEmpty(guild, soloId);
    expect(deleted).toBe(false);
    expect(manager.hasCategory("Solo")).toBe(true);
    expect(mockChannels.has(soloId)).toBe(true);
  });

  it("creates Septa directly below anchor when no other dynamic categories exist", async () => {
    const guild = createMockGuild();
    await manager.initFromState(guild);

    // Anchor is at position 5
    const septaId = await manager.getOrCreateCategory(guild, "Septa");
    const septaChannel = mockChannels.get(septaId);

    // Must be placed directly below anchor (position 6), NOT skipped down to position 12
    expect(septaChannel.position).toBe(6);
  });

  it("places Solo above Trio, and Duo between Solo and Trio", async () => {
    const guild = createMockGuild();
    await manager.initFromState(guild);

    // 1. Trio is created first when Solo does not exist
    const trioId = await manager.getOrCreateCategory(guild, "Trio");
    const trioChannel = mockChannels.get(trioId);
    expect(trioChannel.position).toBe(6); // Directly below anchor (pos 5 + 1)

    // 2. Solo is created when Trio exists -> Solo should be created ABOVE Trio
    const soloId = await manager.getOrCreateCategory(guild, "Solo");
    const soloChannel = mockChannels.get(soloId);
    // After realignment/creation: Solo is at 6, Trio is shifted to 7
    expect(soloChannel.position).toBe(6);
    expect(mockChannels.get(trioId).position).toBe(7);

    // 3. Duo is created when Solo and Trio exist -> Duo should be created UNDER Solo and ABOVE Trio
    const duoId = await manager.getOrCreateCategory(guild, "Duo");
    const duoChannel = mockChannels.get(duoId);
    // After realignment/creation: Solo is at 6, Duo is at 7, Trio is at 8
    expect(soloChannel.position).toBe(6);
    expect(duoChannel.position).toBe(7);
    expect(mockChannels.get(trioId).position).toBe(8);
  });

  it("realigns existing out-of-order categories upon initFromState", async () => {
    // Simulate Septa existing in Discord below other server categories (e.g. at position 12)
    const existingSeptaId = "cat-existing-septa";
    mockChannels.set(existingSeptaId, {
      id: existingSeptaId,
      name: "Septa",
      type: ChannelType.GuildCategory,
      position: 12,
    });

    const guild = createMockGuild();
    await manager.initFromState(guild);

    expect(manager.getCategoryId("Septa")).toBe(existingSeptaId);
    // Realignment automatically moved Septa from position 12 to directly below anchor (position 6)
    expect(mockChannels.get(existingSeptaId).position).toBe(6);
  });
});

