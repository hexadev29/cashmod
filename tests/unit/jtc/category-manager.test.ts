import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ChannelType, type Guild, type CategoryChannel } from "discord.js";
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
  });

  it("creates all eight categories in exact order immediately below anchor and persists", async () => {
    const guild = createMockGuild();

    const result = await manager.ensureInitialized(guild);

    expect(manager.isInitialized()).toBe(true);
    expect(result.size).toBe(8);

    // Verify all 8 categories exist
    const expectedOrder = [
      "Solo",
      "Duo",
      "Trio",
      "Quad",
      "Penta",
      "Hepta",
      "Septa",
      "Octa",
    ];
    for (let i = 0; i < expectedOrder.length; i++) {
      const catName = expectedOrder[i] as any;
      const catId = manager.getCategoryId(catName);
      expect(catId).toBeDefined();

      const discordChannel = mockChannels.get(catId!);
      expect(discordChannel).toBeDefined();
      expect(discordChannel.name).toBe(catName);
      // Positioned immediately below anchor (anchor.position is 5, so 6, 7, 8, ...)
      expect(discordChannel.position).toBe(5 + 1 + i);
    }

    // Verify file was written to disk
    expect(fs.existsSync(testFilePath)).toBe(true);
    const persisted = await stateStore.loadState(guildId, anchorId);
    expect(Object.keys(persisted!)).toHaveLength(8);
  });

  it("subsequent calls reuse existing categories without re-creating", async () => {
    const guild = createMockGuild();
    await manager.ensureInitialized(guild);
    const createCallCount = (guild.channels.create as any).mock.calls.length;
    expect(createCallCount).toBe(8);

    // Call again on the same manager
    await manager.ensureInitialized(guild);
    expect((guild.channels.create as any).mock.calls.length).toBe(8); // No extra calls
  });

  it("restarts reload previously saved categories from disk", async () => {
    const guild = createMockGuild();
    // 1st run
    await manager.ensureInitialized(guild);
    const firstSoloId = manager.getCategoryId("Solo");

    // Simulate restart with a new manager instance reading the same stateStore
    const newManager = new CategoryManager(
      { ...jtcConfig, anchorCategoryId: anchorId },
      stateStore,
    );
    expect(newManager.isInitialized()).toBe(false);

    await newManager.ensureInitialized(guild);
    expect(newManager.isInitialized()).toBe(true);
    expect(newManager.getCategoryId("Solo")).toBe(firstSoloId);
    expect((guild.channels.create as any).mock.calls.length).toBe(8); // No new creation!
  });

  it("safely reconciles if a single category was deleted in Discord", async () => {
    const guild = createMockGuild();
    await manager.ensureInitialized(guild);
    const duoId = manager.getCategoryId("Duo")!;

    // Simulate user deleting Duo in Discord
    mockChannels.delete(duoId);

    // Restart/re-init
    const restartManager = new CategoryManager(
      { ...jtcConfig, anchorCategoryId: anchorId },
      stateStore,
    );
    await restartManager.ensureInitialized(guild);

    expect(restartManager.isInitialized()).toBe(true);
    // Duo should have a new ID
    const newDuoId = restartManager.getCategoryId("Duo");
    expect(newDuoId).toBeDefined();
    expect(newDuoId).not.toBe(duoId);
    // Other categories preserved
    expect(restartManager.getCategoryId("Solo")).toBe(
      manager.getCategoryId("Solo"),
    );
  });

  it("concurrent calls share single-flight initialization and do not duplicate categories", async () => {
    const guild = createMockGuild();

    // Call ensureInitialized concurrently 5 times
    const [r1, r2, r3, r4, r5] = await Promise.all([
      manager.ensureInitialized(guild),
      manager.ensureInitialized(guild),
      manager.ensureInitialized(guild),
      manager.ensureInitialized(guild),
      manager.ensureInitialized(guild),
    ]);

    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
    // Only 8 categories created total
    expect((guild.channels.create as any).mock.calls.length).toBe(8);
  });

  it("fails safely and does not mark complete if anchor category is missing", async () => {
    mockChannels.delete(anchorId); // Anchor does not exist
    const guild = createMockGuild();

    await expect(manager.ensureInitialized(guild)).rejects.toThrow(
      /Anchor category verification failed/,
    );
    expect(manager.isInitialized()).toBe(false);
  });

  it("does not adopt unrelated categories that do not match JTC names", async () => {
    // Add an unrelated category in the server
    mockChannels.set("unrelated-cat", {
      id: "unrelated-cat",
      name: "Staff Channels",
      type: ChannelType.GuildCategory,
      position: 1,
    });

    const guild = createMockGuild();
    await manager.ensureInitialized(guild);

    expect(manager.isManagedCategory("unrelated-cat")).toBe(false);
  });
});
