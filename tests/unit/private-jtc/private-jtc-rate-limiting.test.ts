import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ChannelType,
  Collection,
  PermissionFlagsBits,
  type GuildMember,
  type VoiceChannel,
} from "discord.js";
import { PrivateJtcService } from "../../../src/modules/private-jtc/private-jtc-service.js";
import { PrivateCategoryManager } from "../../../src/modules/private-jtc/private-category-manager.js";
import { PrivateJtcStateStore } from "../../../src/modules/private-jtc/private-jtc-state-store.js";
import { PermissionService } from "../../../src/core/permissions/permission-service.js";
import type { AppConfig } from "../../../src/core/config/config-types.js";
import { defaultPrivateJtcEmojis } from "../../../config/private-jtc/private-jtc.config.js";
import { TaskPriority } from "../../../src/modules/jtc/jtc-queue.js";
import path from "node:path";
import fs from "node:fs";

describe("Private JTC — Rate Limiting, Cleanup & No Recycling", () => {
  const guildId = "123456789012345678";
  const privateAnchorId = "123456789012345679";
  const privateTriggerId = "100000000000000005";
  const dynamicCategoryId = "200000000000000001";
  const testStatePath = path.resolve(
    process.cwd(),
    "data/test-private-jtc-ratelimit.json",
  );

  const mockConfig: AppConfig = {
    discord: {
      guildId,
    },
    env: {
      token: "mock-token",
    },
    diagnostics: {
      logLevel: "error",
      showBanner: false,
    },
    permissions: {
      roles: {
        quarantineRoleId: "900000000000000001",
        superFocusRoleId: "900000000000000002",
        vcRestrictedRoleId: "900000000000000003",
      },
      policies: {
        everyone: { allow: [], deny: [] },
        privateEveryone: {
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
          deny: [PermissionFlagsBits.ManageChannels],
        },
        privateOwner: {
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.SendMessages,
          ],
          deny: [],
        },
      },
    },
    jtc: {
      anchorCategoryId: "123456789012345670",
      cleanup: { delayMs: 0, recheckEmpty: false },
      queue: { concurrency: 1, minTaskDelayMs: 0 },
      categories: {},
      triggers: {},
      categoryOrder: [],
      permissions: {
        everyonePolicyKey: "everyone",
        enableOwnerPermissions: false,
      },
    },
    privateJtc: {
      anchorCategoryId: privateAnchorId,
      triggerChannelId: privateTriggerId,
      categoryName: "Private Rooms",
      roomNameTemplate: "{username}'s Room",
      ownershipTransferDelayMs: 15 * 60 * 1000,
      stateFilePath: testStatePath,
      interfaceImagePath: "assets/vc_interface.png",
      embedColor: 0x2b2d31,
      emojis: defaultPrivateJtcEmojis,
      cleanup: {
        delayMs: 30,
        recheckEmpty: true,
        maxRetries: 2,
        retryDelayMs: 10,
      },
      queue: {
        concurrency: 1,
        minTaskDelayMs: 0,
        maxQueueSize: 100,
        taskTimeoutMs: 15000,
        enableEmptyRoomRecycling: false,
      },
    },
  };

  let stateStore: PrivateJtcStateStore;
  let categoryManager: PrivateCategoryManager;
  let permissionService: PermissionService;
  let service: PrivateJtcService;

  beforeEach(async () => {
    if (fs.existsSync(testStatePath)) {
      await fs.promises.unlink(testStatePath).catch(() => {});
    }
    stateStore = new PrivateJtcStateStore(testStatePath);
    categoryManager = new PrivateCategoryManager(
      mockConfig.privateJtc,
      stateStore,
    );
    permissionService = new PermissionService(mockConfig.permissions);
    service = new PrivateJtcService(
      mockConfig,
      permissionService,
      stateStore,
      categoryManager,
    );
  });

  afterEach(async () => {
    service.clearAllTimers();
    if (fs.existsSync(testStatePath)) {
      await fs.promises.unlink(testStatePath).catch(() => {});
    }
  });

  const createMockVoiceChannel = (opts: {
    id: string;
    name: string;
    userLimit?: number;
    parentId?: string;
    guild: any;
  }): VoiceChannel => {
    const overwrites = new Map<string, any>();
    const members = new Collection<string, GuildMember>();

    const channelObj: any = {
      id: opts.id,
      name: opts.name,
      userLimit: opts.userLimit ?? 0,
      type: ChannelType.GuildVoice,
      parentId: opts.parentId ?? dynamicCategoryId,
      guild: opts.guild,
      members,
      setName: vi.fn().mockImplementation(async (n: string) => {
        channelObj.name = n;
        opts.name = n;
      }),
      setUserLimit: vi.fn().mockImplementation(async (l: number) => {
        channelObj.userLimit = l;
        opts.userLimit = l;
      }),
      permissionOverwrites: {
        cache: overwrites,
        set: vi.fn().mockImplementation(async (newOverwrites: any[]) => {
          overwrites.clear();
          for (const o of newOverwrites) {
            overwrites.set(o.id, o);
          }
        }),
        edit: vi.fn().mockImplementation(async (target: any, perms: any) => {
          const id = typeof target === "string" ? target : target.id;
          overwrites.set(id, { id, ...perms });
        }),
        delete: vi.fn().mockImplementation(async (id: string) => {
          overwrites.delete(id);
        }),
      },
      delete: vi.fn().mockImplementation(async () => {
        opts.guild.channels?.cache?.delete(opts.id);
        return true;
      }),
      send: vi.fn().mockResolvedValue({ id: "msg-1" }),
    };

    return channelObj as unknown as VoiceChannel;
  };

  const createMockGuild = () => {
    const channels = new Map<string, any>();

    const guild: any = {
      id: guildId,
      roles: {
        everyone: { id: guildId },
      },
      members: {
        fetch: vi.fn().mockImplementation(async (id: string) => ({
          id,
          user: { username: `user_${id}` },
        })),
      },
    };

    guild.channels = {
      cache: channels,
      fetch: vi.fn().mockImplementation(async (id?: string) => {
        if (!id) return new Collection(channels.entries());
        return channels.get(id) ?? null;
      }),
      create: vi.fn().mockImplementation(async (opts: any) => {
        const id = `created-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const created = createMockVoiceChannel({
          id,
          name: opts.name,
          userLimit: opts.userLimit,
          parentId: opts.parent,
          guild,
        });
        (created as any).permissionOverwritesPayload = opts.permissionOverwrites;
        channels.set(id, created);
        return created;
      }),
    };

    return { guild, channels };
  };

  it("never recycles empty rooms for private JTC, always creates fresh channels", async () => {
    const { guild, channels } = createMockGuild();
    vi.spyOn(categoryManager, "getOrCreateCategory").mockResolvedValue(
      dynamicCategoryId,
    );

    // Pre-populate an empty channel in the dynamic category
    const existingEmptyChannel = createMockVoiceChannel({
      id: "vc-empty-1",
      name: "Old's Room",
      userLimit: 0,
      parentId: dynamicCategoryId,
      guild,
    });
    channels.set("vc-empty-1", existingEmptyChannel);

    const bobMember: any = {
      id: "owner-bob",
      user: { tag: "Bob#0002", username: "Bob" },
      guild,
      voice: {
        setChannel: vi.fn().mockResolvedValue(true),
      },
    };

    const record = await service.handleVoiceJoin(bobMember, privateTriggerId);

    expect(record).not.toBeNull();
    // A new channel was created via Discord API, NOT recycling existingEmptyChannel!
    expect(record?.channelId).not.toBe("vc-empty-1");
    expect(record?.ownerId).toBe("owner-bob");
    expect(guild.channels.create).toHaveBeenCalled();
  });

  it("does not abort cleanup when user leaves and no one rejoined (fixes stale cancellation bug)", async () => {
    const { guild, channels } = createMockGuild();
    vi.spyOn(categoryManager, "getOrCreateCategory").mockResolvedValue(
      dynamicCategoryId,
    );

    // User joins trigger -> room is created
    const hexaMember: any = {
      id: "owner-hexa",
      user: { tag: "hexa.dev#0001", username: "hexa.dev" },
      guild,
      voice: { setChannel: vi.fn().mockResolvedValue(true) },
    };

    const record = await service.handleVoiceJoin(hexaMember, privateTriggerId);
    expect(record).not.toBeNull();
    const channelId = record!.channelId;
    const channel = channels.get(channelId)!;

    // Discord emits voiceStateUpdate moving member into the newly created room
    channel.members.set(hexaMember.id, hexaMember);
    await service.handleMemberJoin(hexaMember, channel);

    // User talks for a while, then leaves the room
    channel.members.delete(hexaMember.id);
    await service.handleVoiceLeave(channel, hexaMember);

    // Wait past the cleanup delay
    await new Promise((resolve) => setTimeout(resolve, 60));

    // Channel MUST be deleted because no one rejoined!
    expect(channel.delete).toHaveBeenCalled();
    expect(service.isManagedRoom(channelId)).toBe(false);
  });

  it("cancels pending delayed cleanup when a room is rejoined during delay window", async () => {
    const { guild, channels } = createMockGuild();
    vi.spyOn(categoryManager, "getOrCreateCategory").mockResolvedValue(
      dynamicCategoryId,
    );

    // Setup an active room with Alice
    const aliceChannel = createMockVoiceChannel({
      id: "vc-alice",
      name: "Alice's Room",
      userLimit: 0,
      parentId: dynamicCategoryId,
      guild,
    });
    channels.set("vc-alice", aliceChannel);

    const aliceMember: any = {
      id: "owner-alice",
      user: { tag: "Alice#0001", username: "Alice" },
      guild,
      voice: { setChannel: vi.fn() },
    };
    aliceChannel.members.set("owner-alice", aliceMember);

    (service as any).managedRooms.set("vc-alice", {
      channelId: "vc-alice",
      guildId,
      categoryId: dynamicCategoryId,
      ownerId: "owner-alice",
      originalOwnerId: "owner-alice",
      isTransferred: false,
      createdAt: new Date().toISOString(),
      joinHistory: [{ userId: "owner-alice", joinedAt: new Date().toISOString() }],
      trustedUserIds: [],
      settings: { name: "Alice's Room", userLimit: 0, locked: false, hidden: false, chatDisabled: false },
    });

    // Alice leaves -> delayed cleanup initiates (delayMs = 30ms)
    aliceChannel.members.clear();
    const cleanupHandler = service.getCleanupHandler();

    const leavePromise = service.handleVoiceLeave(aliceChannel, aliceMember);

    // Wait a brief tick for async lock to acquire and inFlightCleanups to register
    await new Promise((resolve) => setTimeout(resolve, 5));

    // Verify cleanup is in-flight
    expect(cleanupHandler.isCleanupPending("vc-alice")).toBe(true);

    // Before 30ms expires, friend joins the room directly!
    const friendMember: any = {
      id: "user-friend",
      user: { tag: "Friend#0002", username: "Friend" },
      guild,
      voice: { setChannel: vi.fn().mockResolvedValue(true) },
    };
    aliceChannel.members.set("user-friend", friendMember);

    await service.handleMemberJoin(friendMember, aliceChannel);

    // Wait past the original 30ms cleanup delay
    await leavePromise;
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Deletion should have been aborted because friend rejoined!
    expect(aliceChannel.delete).not.toHaveBeenCalled();
    expect(service.isManagedRoom("vc-alice")).toBe(true);
  });

  it("handles unmanaged room direct join by relocating member to their own private room", async () => {
    const { guild, channels } = createMockGuild();
    vi.spyOn(categoryManager, "getOrCreateCategory").mockResolvedValue(
      dynamicCategoryId,
    );
    vi.spyOn(categoryManager, "getCategoryId").mockReturnValue(
      dynamicCategoryId,
    );

    const unmanagedChannel = createMockVoiceChannel({
      id: "vc-unmanaged",
      name: "Unmanaged Room",
      userLimit: 0,
      parentId: dynamicCategoryId,
      guild,
    });
    channels.set("vc-unmanaged", unmanagedChannel);

    const intruderMember: any = {
      id: "user-intruder",
      user: { tag: "Intruder#0009", username: "Intruder" },
      guild,
      voice: { setChannel: vi.fn().mockResolvedValue(true) },
    };

    const handleVoiceJoinSpy = vi.spyOn(service, "handleVoiceJoin");

    // Intruder directly joins the unmanaged room
    await service.handleMemberJoin(intruderMember, unmanagedChannel);

    // Intruder should be relocated via handleVoiceJoin to trigger channel
    expect(handleVoiceJoinSpy).toHaveBeenCalledWith(
      intruderMember,
      privateTriggerId,
    );
  });

  it("handles over-capacity on direct join by relocating excess user to their own private room", async () => {
    const { guild, channels } = createMockGuild();
    vi.spyOn(categoryManager, "getOrCreateCategory").mockResolvedValue(
      dynamicCategoryId,
    );

    const limitedChannel = createMockVoiceChannel({
      id: "vc-limited",
      name: "Limited Room",
      userLimit: 2,
      parentId: dynamicCategoryId,
      guild,
    });
    channels.set("vc-limited", limitedChannel);

    const member1: any = { id: "user-1", user: { tag: "User1#0001", username: "User1" }, guild };
    const member2: any = { id: "user-2", user: { tag: "User2#0002", username: "User2" }, guild };
    limitedChannel.members.set("user-1", member1);
    limitedChannel.members.set("user-2", member2);

    (service as any).managedRooms.set("vc-limited", {
      channelId: "vc-limited",
      guildId,
      categoryId: dynamicCategoryId,
      ownerId: "user-1",
      originalOwnerId: "user-1",
      isTransferred: false,
      createdAt: new Date().toISOString(),
      joinHistory: [
        { userId: "user-1", joinedAt: new Date().toISOString() },
        { userId: "user-2", joinedAt: new Date().toISOString() },
      ],
      trustedUserIds: [],
      settings: { name: "Limited Room", userLimit: 2, locked: false, hidden: false, chatDisabled: false },
    });

    const excessMember: any = {
      id: "user-excess",
      user: { tag: "Excess#0003", username: "Excess" },
      guild,
      voice: { setChannel: vi.fn().mockResolvedValue(true) },
    };

    // Excess member enters the channel (now 3 members, exceeding userLimit 2)
    limitedChannel.members.set("user-excess", excessMember);

    const handleVoiceJoinSpy = vi.spyOn(service, "handleVoiceJoin");

    await service.handleMemberJoin(excessMember, limitedChannel);

    // Excess member should be relocated to their own private room
    expect(handleVoiceJoinSpy).toHaveBeenCalledWith(
      excessMember,
      privateTriggerId,
    );
  });

  it("queues joins with HIGH priority and leaves with LOW priority via operation queue", async () => {
    const { guild, channels } = createMockGuild();
    vi.spyOn(categoryManager, "getOrCreateCategory").mockResolvedValue(
      dynamicCategoryId,
    );

    const queue = service.getQueue();
    const enqueueSpy = vi.spyOn(queue, "enqueue");

    const member: any = {
      id: "user-queue-test",
      user: { tag: "QueueTest#0001", username: "QueueTest" },
      guild,
      voice: { setChannel: vi.fn().mockResolvedValue(true) },
    };

    const room = createMockVoiceChannel({
      id: "vc-queue-1",
      name: "Queue Room",
      parentId: dynamicCategoryId,
      guild,
    });
    channels.set("vc-queue-1", room);

    // 1. queueVoiceJoin
    await service.queueVoiceJoin(member, privateTriggerId);
    expect(enqueueSpy).toHaveBeenCalledWith(
      expect.any(Function),
      TaskPriority.HIGH,
    );

    // 2. queueMemberJoin
    await service.queueMemberJoin(member, room);
    expect(enqueueSpy).toHaveBeenCalledWith(
      expect.any(Function),
      TaskPriority.HIGH,
    );

    // 3. queueVoiceLeave
    await service.queueVoiceLeave(room, member);
    expect(enqueueSpy).toHaveBeenCalledWith(
      expect.any(Function),
      TaskPriority.LOW,
      `private-leave:${room.id}`,
    );
  });
});
