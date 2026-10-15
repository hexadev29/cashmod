import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ChannelType,
  type Guild,
  type GuildMember,
  type VoiceChannel,
} from "discord.js";
import { JtcService } from "../../../src/modules/jtc/jtc-service.js";
import { PermissionService } from "../../../src/core/permissions/permission-service.js";
import { CategoryManager } from "../../../src/modules/jtc/category-manager.js";
import { JtcStateStore } from "../../../src/modules/jtc/jtc-state-store.js";
import type { AppConfig } from "../../../src/core/config/config-types.js";
import { JTC_CATEGORY_ORDER } from "../../../config/jtc/jtc.config.js";

const anchorId = "123456789012345679";
const testStateDir = path.resolve(process.cwd(), "data/test-service-state");
const testStateFile = path.join(testStateDir, "jtc-categories.json");

const createMockConfig = (): AppConfig => ({
  env: { nodeEnv: "test", token: "mock-token" },
  discord: {
    guildId: "123456789012345678",
    activity: { name: "CA Study Hub", type: 2 },
    clientOptions: { intents: [] },
  },
  permissions: {
    policies: {
      everyone: { allow: [1n], deny: [] },
      roomOwner: { allow: [2n], deny: [] },
    },
  },
  jtc: {
    anchorCategoryId: anchorId,
    categoryOrder: JTC_CATEGORY_ORDER,
    categories: {
      Solo: { name: "Solo", categoryId: anchorId, userLimit: 1 },
      Duo: { name: "Duo", categoryId: anchorId, userLimit: 2 },
      Trio: { name: "Trio", categoryId: anchorId, userLimit: 3 },
      Quad: { name: "Quad", categoryId: anchorId, userLimit: 4 },
    },
    triggers: {
      "100000000000000001": {
        triggerChannelId: "100000000000000001",
        categoryName: "Solo",
        roomNameTemplate: "Solo #{number}",
        userLimit: 1,
      },
      "100000000000000002": {
        triggerChannelId: "100000000000000002",
        categoryName: "Duo",
        roomNameTemplate: "Duo #{number}",
        userLimit: 2,
      },
      "100000000000000003": {
        triggerChannelId: "100000000000000003",
        categoryName: "Trio",
        roomNameTemplate: "Trio #{number}",
        userLimit: 3,
      },
    },
    namingRegex: /^(Solo|Duo|Trio|Quad)\s+#(\d+)$/i,
    positioning: {},
    cleanup: {
      delayMs: 0,
      recheckEmpty: false,
      maxRetries: 1,
      retryDelayMs: 0,
    },
    queue: {
      concurrency: 1,
      minTaskDelayMs: 0,
      maxQueueSize: 100,
      taskTimeoutMs: 10000,
      enableEmptyRoomRecycling: true,
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

describe("JtcService", () => {
  let config: AppConfig;
  let permissionService: PermissionService;
  let categoryManager: CategoryManager;
  let service: JtcService;
  let createdChannels: Map<string, any>;
  let channelCounter = 0;

  beforeEach(async () => {
    if (fs.existsSync(testStateDir)) {
      await fs.promises.rm(testStateDir, { recursive: true, force: true });
    }

    config = createMockConfig();
    permissionService = new PermissionService(
      config.permissions,
      config.jtc.permissions,
    );
    const stateStore = new JtcStateStore(testStateFile);
    categoryManager = new CategoryManager(config.jtc, stateStore);
    service = new JtcService(
      config,
      permissionService,
      undefined,
      categoryManager,
    );

    createdChannels = new Map();
    channelCounter = 0;

    // Anchor Category channel in guild
    createdChannels.set(anchorId, {
      id: anchorId,
      name: "━━ ANCHOR CATEGORY ━━",
      type: ChannelType.GuildCategory,
      position: 0,
      isVoiceBased: () => false,
      isDMBased: () => false,
    });
  });

  afterEach(async () => {
    if (fs.existsSync(testStateDir)) {
      await fs.promises.rm(testStateDir, { recursive: true, force: true });
    }
  });

  const createMockGuild = (): Guild => {
    const guild = {
      id: config.discord.guildId,
      name: "Test Guild",
      channels: {
        cache: createdChannels,
        fetch: vi.fn().mockImplementation(async (id?: string) => {
          if (id) {
            return createdChannels.get(id) ?? null;
          }
          return createdChannels;
        }),
        create: vi.fn().mockImplementation(async (opts: any) => {
          channelCounter++;
          const chId = `created-ch-${channelCounter}`;
          const isCategory = opts.type === ChannelType.GuildCategory;
          const newCh = {
            id: chId,
            name: opts.name,
            type: opts.type,
            parentId: opts.parent,
            position: opts.position ?? 0,
            userLimit: opts.userLimit,
            isVoiceBased: () => !isCategory,
            isDMBased: () => false,
            members: { size: 1 },
            deletable: true,
            guild: null as any,
            delete: vi.fn().mockImplementation(async () => {
              createdChannels.delete(chId);
            }),
          };
          newCh.guild = guild as any;
          createdChannels.set(chId, newCh);
          return newCh;
        }),
      },
    } as unknown as Guild;

    return guild;
  };

  const createMockMember = (
    id: string,
    guild: Guild,
    failMove = false,
  ): GuildMember => {
    return {
      id,
      guild,
      user: { id, tag: `User#${id}` },
      voice: {
        setChannel: vi.fn().mockImplementation(async () => {
          if (failMove) {
            throw new Error("Member disconnected or move failed");
          }
        }),
      },
    } as unknown as GuildMember;
  };

  it("allocates room #1 on first join, creates Solo category on demand, and moves member", async () => {
    const guild = createMockGuild();
    const member = createMockMember("m1", guild);

    const result = await service.handleVoiceJoin(member, "100000000000000001");

    expect(result).not.toBeNull();
    expect(result?.roomNumber).toBe(1);
    expect(result?.channel.name).toBe("Solo #1");
    expect(service.isManagedRoom(result!.channel.id)).toBe(true);
    expect(member.voice.setChannel).toHaveBeenCalledWith(
      result?.channel,
      expect.any(String),
    );

    // Solo category is resolved from predefined config
    expect(categoryManager.hasCategory("Solo")).toBe(true);
    expect(result?.channel.parentId).toBe(anchorId);
  });

  it("compensates and deletes channel if moving member fails", async () => {
    const guild = createMockGuild();
    const member = createMockMember("m2", guild, true); // failMove = true

    const result = await service.handleVoiceJoin(member, "100000000000000001");

    expect(result).toBeNull();
    // Verify voice channel was deleted during compensation (only categories remain)
    const voiceChannels = Array.from(createdChannels.values()).filter((ch) =>
      ch.isVoiceBased(),
    );
    expect(voiceChannels).toHaveLength(0);
  });

  it("handles concurrent joins without allocating duplicate room numbers", async () => {
    const guild = createMockGuild();
    const memberA = createMockMember("mA", guild);
    const memberB = createMockMember("mB", guild);

    // Run both joins concurrently
    const [resA, resB] = await Promise.all([
      service.handleVoiceJoin(memberA, "100000000000000001"),
      service.handleVoiceJoin(memberB, "100000000000000001"),
    ]);

    expect(resA).not.toBeNull();
    expect(resB).not.toBeNull();

    const roomNums = [resA!.roomNumber, resB!.roomNumber].sort();
    expect(roomNums).toEqual([1, 2]);
    expect(resA!.channel.name).not.toBe(resB!.channel.name);
  });

  it("cleans up empty managed room on voice leave without deleting predefined category", async () => {
    const guild = createMockGuild();
    const member = createMockMember("m3", guild);

    const alloc = await service.handleVoiceJoin(member, "100000000000000001");
    expect(alloc).not.toBeNull();
    const soloCatId = categoryManager.getCategoryId("Solo")!;
    expect(soloCatId).toBeDefined();

    const channel = alloc!.channel as any;
    // Simulate member leaving -> size becomes 0
    channel.members.size = 0;

    const cleaned = await service.handleVoiceLeave(channel as VoiceChannel);
    expect(cleaned).toBe(true);
    expect(channel.delete).toHaveBeenCalled();
    expect(service.isManagedRoom(channel.id)).toBe(false);

    // Predefined category is permanent and must NOT be deleted
    expect(categoryManager.hasCategory("Solo")).toBe(true);
  });

  it("retains predefined category when rooms leave", async () => {
    const guild = createMockGuild();
    const memberA = createMockMember("mA", guild);
    const memberB = createMockMember("mB", guild);

    const allocA = await service.handleVoiceJoin(memberA, "100000000000000001");
    const allocB = await service.handleVoiceJoin(memberB, "100000000000000001");
    expect(allocA).not.toBeNull();
    expect(allocB).not.toBeNull();

    const soloCatId = categoryManager.getCategoryId("Solo")!;
    expect(soloCatId).toBeDefined();

    // Member A leaves room A
    const channelA = allocA!.channel as any;
    channelA.members.size = 0;
    await service.handleVoiceLeave(channelA as VoiceChannel);

    // Solo #1 is gone, but Solo #2 still remains
    expect(createdChannels.has(channelA.id)).toBe(false);
    expect(categoryManager.hasCategory("Solo")).toBe(true);

    // Member B leaves room B
    const channelB = allocB!.channel as any;
    channelB.members.size = 0;
    await service.handleVoiceLeave(channelB as VoiceChannel);

    // Now all rooms are gone, but predefined category remains permanent!
    expect(createdChannels.has(channelB.id)).toBe(false);
    expect(categoryManager.hasCategory("Solo")).toBe(true);
  });

  it("recycles existing empty rooms in ascending order (Solo #3, #6, #7 -> allocates #3 first)", async () => {
    const guild = createMockGuild();

    // 1. Initialize Solo category
    const soloCatId = await categoryManager.getOrCreateCategory(guild, "Solo");

    // 2. Simulate empty rooms Solo #7, Solo #3, Solo #6 already existing in Discord
    const room7 = {
      id: "room-7",
      name: "Solo #7",
      type: ChannelType.GuildVoice,
      parentId: soloCatId,
      position: 7,
      members: { size: 0 },
      isVoiceBased: () => true,
      permissionOverwrites: { set: vi.fn().mockResolvedValue(undefined) },
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const room3 = {
      id: "room-3",
      name: "Solo #3",
      type: ChannelType.GuildVoice,
      parentId: soloCatId,
      position: 3,
      members: { size: 0 },
      isVoiceBased: () => true,
      permissionOverwrites: { set: vi.fn().mockResolvedValue(undefined) },
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const room6 = {
      id: "room-6",
      name: "Solo #6",
      type: ChannelType.GuildVoice,
      parentId: soloCatId,
      position: 6,
      members: { size: 0 },
      isVoiceBased: () => true,
      permissionOverwrites: { set: vi.fn().mockResolvedValue(undefined) },
      delete: vi.fn().mockResolvedValue(undefined),
    };

    createdChannels.set("room-7", room7);
    createdChannels.set("room-3", room3);
    createdChannels.set("room-6", room6);

    const initialCreateCount = (guild.channels.create as any).mock.calls.length;

    // 3. Member 1 joins -> must receive lowest empty room: Solo #3
    const member1 = createMockMember("u1", guild);
    const alloc1 = await service.handleVoiceJoin(member1, "100000000000000001");
    expect(alloc1).not.toBeNull();
    expect(alloc1?.roomNumber).toBe(3);
    expect(alloc1?.channel.id).toBe("room-3");
    expect(member1.voice.setChannel).toHaveBeenCalledWith(
      room3,
      "Cash Mod JTC move to recycled room",
    );
    // Crucial: NO channels.create call was made! Saved rate-limit quota!
    expect((guild.channels.create as any).mock.calls.length).toBe(
      initialCreateCount,
    );

    // Now room-3 has an occupant
    room3.members.size = 1;

    // 4. Member 2 joins -> must receive next lowest empty room: Solo #6
    const member2 = createMockMember("u2", guild);
    const alloc2 = await service.handleVoiceJoin(member2, "100000000000000001");
    expect(alloc2).not.toBeNull();
    expect(alloc2?.roomNumber).toBe(6);
    expect(alloc2?.channel.id).toBe("room-6");

    // Now room-6 has an occupant
    room6.members.size = 1;

    // 5. Member 3 joins -> must receive remaining empty room: Solo #7
    const member3 = createMockMember("u3", guild);
    const alloc3 = await service.handleVoiceJoin(member3, "100000000000000001");
    expect(alloc3).not.toBeNull();
    expect(alloc3?.roomNumber).toBe(7);
    expect(alloc3?.channel.id).toBe("room-7");

    // Zero channels created across all 3 joins!
    expect((guild.channels.create as any).mock.calls.length).toBe(
      initialCreateCount,
    );
  });

  it("queueVoiceJoin and queueVoiceLeave process through operation queue", async () => {
    const guild = createMockGuild();
    const member = createMockMember("qUser", guild);

    const alloc = await service.queueVoiceJoin(member, "100000000000000001");
    expect(alloc).not.toBeNull();
    expect(alloc?.roomNumber).toBe(1);

    const channel = alloc!.channel as any;
    channel.members.size = 0;

    const cleaned = await service.queueVoiceLeave(channel as VoiceChannel);
    expect(cleaned).toBe(true);
  });

  it("handleDirectJoin adopts empty room awaiting cleanup, sets owner, and applies permissions", async () => {
    const guild = createMockGuild();
    const soloCatId = await categoryManager.getOrCreateCategory(guild, "Solo");

    const room3 = {
      id: "room-direct-3",
      name: "Solo #3",
      type: ChannelType.GuildVoice,
      parentId: soloCatId,
      position: 3,
      members: { size: 1, has: (id: string) => id === "user-direct-1" },
      isVoiceBased: () => true,
      permissionOverwrites: { set: vi.fn().mockResolvedValue(undefined) },
      delete: vi.fn().mockResolvedValue(undefined),
      guild,
    };
    createdChannels.set("room-direct-3", room3);

    const member = createMockMember("user-direct-1", guild);
    await service.handleDirectJoin(member, room3 as unknown as VoiceChannel);

    expect(service.isManagedRoom("room-direct-3")).toBe(true);
    const managedRecord = service.getManagedRoom("room-direct-3");
    expect(managedRecord).toBeDefined();
    expect(managedRecord?.ownerId).toBe("user-direct-1");
    expect(managedRecord?.roomNumber).toBe(3);
    expect(managedRecord?.categoryName).toBe("Solo");
    expect(room3.permissionOverwrites.set).toHaveBeenCalled();
  });

  it("handles direct click collision with reservation by relocating excess user to separate room", async () => {
    const guild = createMockGuild();
    const soloCatId = await categoryManager.getOrCreateCategory(guild, "Solo");

    // Empty rooms Solo #3 and Solo #6 exist
    const room3 = {
      id: "room-3",
      name: "Solo #3",
      type: ChannelType.GuildVoice,
      parentId: soloCatId,
      position: 3,
      members: { size: 0, has: () => false },
      isVoiceBased: () => true,
      permissionOverwrites: { set: vi.fn().mockResolvedValue(undefined) },
      delete: vi.fn().mockResolvedValue(undefined),
      guild,
    };
    const room6 = {
      id: "room-6",
      name: "Solo #6",
      type: ChannelType.GuildVoice,
      parentId: soloCatId,
      position: 6,
      members: { size: 0, has: () => false },
      isVoiceBased: () => true,
      permissionOverwrites: { set: vi.fn().mockResolvedValue(undefined) },
      delete: vi.fn().mockResolvedValue(undefined),
      guild,
    };
    createdChannels.set("room-3", room3);
    createdChannels.set("room-6", room6);

    const memberA = createMockMember("userA", guild);
    const memberB = createMockMember("userB", guild);

    // Simulate memberA triggering room creation which reserves room-3 during recycling
    // In our test, we inject room-3 as reserved for userA by simulating a concurrent join
    (service as any).reservedChannelIds.add("room-3");
    (service as any).reservedChannelOwners.set("room-3", "userA");

    // Member B directly clicks room-3 while it's reserved for userA
    room3.members.size = 1;
    (room3.members as any).has = (id: string) => id === "userB";

    await service.handleDirectJoin(memberB, room3 as unknown as VoiceChannel);

    // Member B must be relocated to room-6 because room-3 is reserved for userA!
    expect(memberB.voice.setChannel).toHaveBeenCalledWith(
      room6,
      "Cash Mod JTC move to recycled room",
    );
    expect(service.getManagedRoom("room-6")?.ownerId).toBe("userB");

    // Cleanup reservation for userA
    (service as any).reservedChannelIds.delete("room-3");
    (service as any).reservedChannelOwners.delete("room-3");
  });

  it("handles over-capacity in Solo room (limit 1) by relocating the excess user to a new Solo room", async () => {
    const guild = createMockGuild();
    const soloCatId = await categoryManager.getOrCreateCategory(guild, "Solo");

    // Solo #1 is occupied by userA
    const room1 = {
      id: "room-solo-1",
      name: "Solo #1",
      type: ChannelType.GuildVoice,
      parentId: soloCatId,
      position: 1,
      members: {
        size: 2, // 2 members in a room with userLimit 1!
        has: (id: string) => id === "userA" || id === "userB",
      },
      isVoiceBased: () => true,
      permissionOverwrites: { set: vi.fn().mockResolvedValue(undefined) },
      delete: vi.fn().mockResolvedValue(undefined),
      guild,
    };
    createdChannels.set("room-solo-1", room1);

    // Register userA as legitimate owner of Solo #1
    (service as any).managedRooms.set("room-solo-1", {
      channelId: "room-solo-1",
      guildId: guild.id,
      ownerId: "userA",
      categoryName: "Solo",
      roomNumber: 1,
      createdAt: new Date(),
    });

    const memberB = createMockMember("userB", guild);

    // Member B directly joins room-solo-1, causing over-capacity (2 > 1)
    await service.handleDirectJoin(memberB, room1 as unknown as VoiceChannel);

    // Member B is excess and must be moved to their own Solo room (Solo #2)
    expect(memberB.voice.setChannel).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Solo #2" }),
      "Cash Mod JTC move to created room",
    );

    // Original occupant userA is still owner of Solo #1
    expect(service.getManagedRoom("room-solo-1")?.ownerId).toBe("userA");
  });

  it("handles over-capacity in Duo room (limit 2) by relocating the 3rd user to a new Duo room", async () => {
    const guild = createMockGuild();
    const duoCatId = await categoryManager.getOrCreateCategory(guild, "Duo");

    // Duo #1 has 3 members (limit is 2)
    const duoRoom1 = {
      id: "room-duo-1",
      name: "Duo #1",
      type: ChannelType.GuildVoice,
      parentId: duoCatId,
      position: 1,
      members: {
        size: 3, // 3 members > 2!
        has: (id: string) => id === "user1" || id === "user2" || id === "user3",
      },
      isVoiceBased: () => true,
      permissionOverwrites: { set: vi.fn().mockResolvedValue(undefined) },
      delete: vi.fn().mockResolvedValue(undefined),
      guild,
    };
    createdChannels.set("room-duo-1", duoRoom1);

    // Register user1 as owner of Duo #1
    (service as any).managedRooms.set("room-duo-1", {
      channelId: "room-duo-1",
      guildId: guild.id,
      ownerId: "user1",
      categoryName: "Duo",
      roomNumber: 1,
      createdAt: new Date(),
    });

    const member3 = createMockMember("user3", guild);

    // Member 3 directly joined Duo #1, triggering over-capacity
    await service.handleDirectJoin(member3, duoRoom1 as unknown as VoiceChannel);

    // Member 3 must be moved to their own Duo room (Duo #2)
    expect(member3.voice.setChannel).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Duo #2" }),
      "Cash Mod JTC move to created room",
    );
    expect(service.getManagedRoom("room-duo-1")?.ownerId).toBe("user1");
  });

  it("handles over-capacity in Trio room (limit 3) by relocating the 4th user to a new Trio room", async () => {
    const guild = createMockGuild();
    const trioCatId = await categoryManager.getOrCreateCategory(guild, "Trio");

    // Trio #1 has 4 members (limit is 3)
    const trioRoom1 = {
      id: "room-trio-1",
      name: "Trio #1",
      type: ChannelType.GuildVoice,
      parentId: trioCatId,
      position: 1,
      members: {
        size: 4, // 4 members > 3!
        has: (id: string) =>
          id === "u1" || id === "u2" || id === "u3" || id === "u4",
      },
      isVoiceBased: () => true,
      permissionOverwrites: { set: vi.fn().mockResolvedValue(undefined) },
      delete: vi.fn().mockResolvedValue(undefined),
      guild,
    };
    createdChannels.set("room-trio-1", trioRoom1);

    (service as any).managedRooms.set("room-trio-1", {
      channelId: "room-trio-1",
      guildId: guild.id,
      ownerId: "u1",
      categoryName: "Trio",
      roomNumber: 1,
      createdAt: new Date(),
    });

    const member4 = createMockMember("u4", guild);

    await service.handleDirectJoin(member4, trioRoom1 as unknown as VoiceChannel);

    // Member 4 must be moved to their own Trio room (Trio #2)
    expect(member4.voice.setChannel).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Trio #2" }),
      "Cash Mod JTC move to created room",
    );
    expect(service.getManagedRoom("room-trio-1")?.ownerId).toBe("u1");
  });

  it("queueDirectJoin processes via operation queue with HIGH priority", async () => {
    const guild = createMockGuild();
    const soloCatId = await categoryManager.getOrCreateCategory(guild, "Solo");

    const room = {
      id: "room-queued",
      name: "Solo #5",
      type: ChannelType.GuildVoice,
      parentId: soloCatId,
      position: 5,
      members: { size: 1, has: () => true },
      isVoiceBased: () => true,
      permissionOverwrites: { set: vi.fn().mockResolvedValue(undefined) },
      delete: vi.fn().mockResolvedValue(undefined),
      guild,
    };
    createdChannels.set("room-queued", room);

    const member = createMockMember("queuedDirectUser", guild);
    await service.queueDirectJoin(member, room as unknown as VoiceChannel);

    expect(service.isManagedRoom("room-queued")).toBe(true);
    expect(service.getManagedRoom("room-queued")?.ownerId).toBe(
      "queuedDirectUser",
    );
  });
});

