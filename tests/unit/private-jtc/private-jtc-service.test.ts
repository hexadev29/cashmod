import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ChannelType,
  Collection,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type VoiceChannel,
} from "discord.js";
import { PrivateJtcService } from "../../../src/modules/private-jtc/private-jtc-service.js";
import { PrivateCategoryManager } from "../../../src/modules/private-jtc/private-category-manager.js";
import { PrivateJtcStateStore } from "../../../src/modules/private-jtc/private-jtc-state-store.js";
import { PermissionService } from "../../../src/core/permissions/permission-service.js";
import type { AppConfig } from "../../../src/core/config/config-types.js";
import path from "node:path";
import fs from "node:fs";

describe("PrivateJtcService", () => {
  const guildId = "123456789012345678";
  const privateAnchorId = "123456789012345679";
  const privateTriggerId = "100000000000000005";
  const dynamicCategoryId = "200000000000000001";
  const testStatePath = path.resolve(
    process.cwd(),
    "data/test-private-jtc-service.json",
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
      cleanup: { emptyChannelDeleteDelayMs: 0 },
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
      ownershipTransferDelayMs: 15 * 60 * 1000, // 15 mins
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
        enableEmptyRoomRecycling: true,
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

  const createMockGuild = (channelsMap: Map<string, any> = new Map()): Guild => {
    return {
      id: guildId,
      name: "Test Guild",
      channels: {
        cache: channelsMap,
        fetch: vi.fn().mockImplementation(async (id?: string) => {
          if (!id) return channelsMap;
          return channelsMap.get(id) ?? null;
        }),
        create: vi.fn().mockImplementation(async (data: any) => {
          const newChan = createMockVoiceChannel({
            id: `created-vc-${Date.now()}`,
            name: data.name,
            parentId: data.parent,
          });
          channelsMap.set(newChan.id, newChan);
          return newChan;
        }),
      },
      members: {
        fetch: vi.fn().mockImplementation(async (userId: string) => {
          return {
            id: userId,
            user: { username: `user_${userId}` },
            displayName: `Display_${userId}`,
          };
        }),
      },
    } as unknown as Guild;
  };

  const createMockVoiceChannel = (opts: {
    id: string;
    name: string;
    parentId?: string | null;
    members?: Collection<string, GuildMember>;
    guild?: Guild;
  }): VoiceChannel => {
    const members = opts.members ?? new Collection<string, GuildMember>();
    const permOverwrites = new Map();

    return {
      id: opts.id,
      name: opts.name,
      type: ChannelType.GuildVoice,
      parentId: opts.parentId ?? dynamicCategoryId,
      members,
      isVoiceBased: () => true,
      guild: opts.guild ?? ({ id: guildId, name: "Test Guild" } as any),
      delete: vi.fn().mockResolvedValue(true),
      setName: vi.fn().mockImplementation(async (newName: string) => {
        opts.name = newName;
      }),
      permissionOverwrites: {
        cache: permOverwrites,
        set: vi.fn().mockImplementation(async (ow: any) => {
          for (const item of ow) permOverwrites.set(item.id, item);
        }),
        edit: vi.fn().mockImplementation(async (userId: string, data: any) => {
          permOverwrites.set(userId, { id: userId, ...data });
        }),
      },
    } as unknown as VoiceChannel;
  };

  const createMockMember = (userId: string, username: string, guild: Guild): GuildMember => {
    return {
      id: userId,
      user: { id: userId, username, tag: `${username}#0001` },
      guild,
      voice: {
        channelId: privateTriggerId,
        setChannel: vi.fn().mockResolvedValue(true),
      },
    } as unknown as GuildMember;
  };

  it("creates a private room with {username}'s Room name and records initial owner", async () => {
    const channels = new Map<string, any>();
    // Anchor category
    channels.set(privateAnchorId, {
      id: privateAnchorId,
      name: "Private Anchor",
      type: ChannelType.GuildCategory,
      position: 10,
    });
    // Dynamic category mock
    vi.spyOn(categoryManager, "getOrCreateCategory").mockResolvedValue(dynamicCategoryId);

    const guild = createMockGuild(channels);
    const member = createMockMember("user-owner-1", "john", guild);

    const record = await service.handleVoiceJoin(member, privateTriggerId);

    expect(record).not.toBeNull();
    expect(record?.ownerId).toBe("user-owner-1");
    expect(record?.joinHistory).toHaveLength(1);
    expect(record?.joinHistory[0].userId).toBe("user-owner-1");
    expect(service.isManagedRoom(record!.channelId)).toBe(true);

    // Verify channel creation
    expect(guild.channels.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "john's Room",
        type: ChannelType.GuildVoice,
        parent: dynamicCategoryId,
      }),
    );
    expect(member.voice.setChannel).toHaveBeenCalled();

    // Verify persistence to state store
    const persisted = await stateStore.loadState(guildId, privateAnchorId);
    expect(persisted).not.toBeNull();
    expect(persisted?.rooms[record!.channelId]).toBeDefined();
    expect(persisted?.rooms[record!.channelId].ownerId).toBe("user-owner-1");
  });

  it("records join order when additional members join an existing private room", async () => {
    const channels = new Map<string, any>();
    const guild = createMockGuild(channels);

    const channel = createMockVoiceChannel({
      id: "vc-1",
      name: "john's Room",
      parentId: dynamicCategoryId,
    });
    channels.set("vc-1", channel);

    // Register room manually
    (service as any).managedRooms.set("vc-1", {
      channelId: "vc-1",
      guildId,
      categoryId: dynamicCategoryId,
      ownerId: "user-owner-1",
      createdAt: new Date().toISOString(),
      joinHistory: [{ userId: "user-owner-1", joinedAt: new Date().toISOString() }],
    });

    const member2 = createMockMember("user-2", "alice", guild);
    await service.handleMemberJoin(member2, channel);

    const record = service.getManagedRoom("vc-1");
    expect(record?.joinHistory).toHaveLength(2);
    expect(record?.joinHistory[1].userId).toBe("user-2");

    // Joining again should not duplicate entry
    await service.handleMemberJoin(member2, channel);
    expect(record?.joinHistory).toHaveLength(2);
  });

  it("deletes private room and dynamic category when room becomes empty", async () => {
    const channels = new Map<string, any>();
    const guild = createMockGuild(channels);
    const deleteCatSpy = vi.spyOn(categoryManager, "deleteCategoryIfEmpty").mockResolvedValue(true);

    const channel = createMockVoiceChannel({
      id: "vc-1",
      name: "john's Room",
      members: new Collection(), // empty
      guild,
    });
    channels.set("vc-1", channel);

    (service as any).managedRooms.set("vc-1", {
      channelId: "vc-1",
      guildId,
      categoryId: dynamicCategoryId,
      ownerId: "user-1",
      createdAt: new Date().toISOString(),
      joinHistory: [{ userId: "user-1", joinedAt: new Date().toISOString() }],
    });

    await service.handleVoiceLeave(channel);

    expect(channel.delete).toHaveBeenCalled();
    expect(service.isManagedRoom("vc-1")).toBe(false);
    expect(deleteCatSpy).toHaveBeenCalledWith(guild);
  });

  it("transfers ownership immediately if next candidate in join order has been present >= 15 minutes", async () => {
    const channels = new Map<string, any>();
    const guild = createMockGuild(channels);

    const ownerMember = createMockMember("user-1", "john", guild);
    const candidateMember = createMockMember("user-2", "sarah", guild);

    const channelMembers = new Collection<string, GuildMember>();
    // Owner already left, only candidate remains
    channelMembers.set("user-2", candidateMember);

    const channel = createMockVoiceChannel({
      id: "vc-1",
      name: "john's Room",
      members: channelMembers,
    });
    (channel as any).guild = guild;
    channels.set("vc-1", channel);

    // Candidate joined 20 minutes ago (>= 15 minutes)
    const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    (service as any).managedRooms.set("vc-1", {
      channelId: "vc-1",
      guildId,
      categoryId: dynamicCategoryId,
      ownerId: "user-1",
      createdAt: twentyMinsAgo,
      joinHistory: [
        { userId: "user-1", joinedAt: twentyMinsAgo },
        { userId: "user-2", joinedAt: twentyMinsAgo },
        { userId: "user-3", joinedAt: tenMinsAgo },
      ],
    });

    const setOwnerPermsSpy = vi.spyOn(permissionService, "setOwnerPermissions").mockResolvedValue();

    // Owner leaves
    await service.handleVoiceLeave(channel, ownerMember);

    const updatedRecord = service.getManagedRoom("vc-1");
    expect(updatedRecord?.ownerId).toBe("user-2");
    expect(channel.setName).toHaveBeenCalledWith("user_user-2's Room", expect.any(String));

    // Old owner revoked, new owner granted
    expect(setOwnerPermsSpy).toHaveBeenCalledWith(channel, "user-1", false);
    expect(setOwnerPermsSpy).toHaveBeenCalledWith(channel, "user-2", true);
  });

  it("schedules ownership transfer timer if candidate has been present < 15 minutes", async () => {
    vi.useFakeTimers();

    const channels = new Map<string, any>();
    const guild = createMockGuild(channels);

    const ownerMember = createMockMember("user-1", "john", guild);
    const candidateMember = createMockMember("user-2", "sarah", guild);

    const channelMembers = new Collection<string, GuildMember>();
    channelMembers.set("user-2", candidateMember);

    const channel = createMockVoiceChannel({
      id: "vc-1",
      name: "john's Room",
      members: channelMembers,
    });
    (channel as any).guild = guild;
    channels.set("vc-1", channel);

    // Candidate joined 5 minutes ago (< 15 mins; needs 10 more minutes)
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    (service as any).managedRooms.set("vc-1", {
      channelId: "vc-1",
      guildId,
      categoryId: dynamicCategoryId,
      ownerId: "user-1",
      createdAt: fiveMinsAgo,
      joinHistory: [
        { userId: "user-1", joinedAt: fiveMinsAgo },
        { userId: "user-2", joinedAt: fiveMinsAgo },
      ],
    });

    const transferSpy = vi.spyOn(service, "transferOwnership").mockResolvedValue(true);

    // Owner leaves
    await service.handleVoiceLeave(channel, ownerMember);

    // Should NOT have transferred immediately
    expect(transferSpy).not.toHaveBeenCalled();

    // Fast forward 9 minutes (total 14 minutes, still < 15)
    vi.advanceTimersByTime(9 * 60 * 1000);
    expect(transferSpy).not.toHaveBeenCalled();

    // Fast forward 1 more minute (now >= 15 minutes)
    vi.advanceTimersByTime(1 * 60 * 1000);

    expect(transferSpy).toHaveBeenCalledWith(channel, "user-2");

    vi.useRealTimers();
  });

  it("reconciles startup state by deleting empty rooms and retaining active rooms", async () => {
    const channels = new Map<string, any>();
    const guild = createMockGuild(channels);

    // Room 1: empty in Discord -> should be deleted
    const emptyChannel = createMockVoiceChannel({
      id: "vc-empty",
      name: "Empty Room",
      members: new Collection(),
    });
    channels.set("vc-empty", emptyChannel);

    // Room 2: has occupant -> should be retained
    const activeMember = createMockMember("user-active", "active", guild);
    const activeChannelMembers = new Collection<string, GuildMember>();
    activeChannelMembers.set("user-active", activeMember);

    const activeChannel = createMockVoiceChannel({
      id: "vc-active",
      name: "Active Room",
      members: activeChannelMembers,
    });
    channels.set("vc-active", activeChannel);

    // Save initial state to disk
    await stateStore.saveState(guildId, privateAnchorId, {
      categoryId: dynamicCategoryId,
      rooms: {
        "vc-empty": {
          channelId: "vc-empty",
          guildId,
          categoryId: dynamicCategoryId,
          ownerId: "user-old-1",
          createdAt: new Date().toISOString(),
          joinHistory: [{ userId: "user-old-1", joinedAt: new Date().toISOString() }],
        },
        "vc-active": {
          channelId: "vc-active",
          guildId,
          categoryId: dynamicCategoryId,
          ownerId: "user-active",
          createdAt: new Date().toISOString(),
          joinHistory: [{ userId: "user-active", joinedAt: new Date().toISOString() }],
        },
      },
    });

    const result = await service.reconcile(guild);

    expect(result.totalScanned).toBe(2);
    expect(result.deleted).toBe(1);
    expect(result.retained).toBe(1);
    expect(emptyChannel.delete).toHaveBeenCalled();
    expect(service.isManagedRoom("vc-active")).toBe(true);
    expect(service.isManagedRoom("vc-empty")).toBe(false);
  });
});
