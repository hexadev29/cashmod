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
import { defaultPrivateJtcEmojis } from "../../../config/private-jtc/private-jtc.config.js";
import path from "node:path";
import fs from "node:fs";

describe("PrivateJtcService — Room Controls & Transferred Ownership Persistence", () => {
  const guildId = "123456789012345678";
  const privateAnchorId = "123456789012345679";
  const privateTriggerId = "100000000000000005";
  const dynamicCategoryId = "200000000000000001";
  const testStatePath = path.resolve(
    process.cwd(),
    "data/test-private-jtc-controls.json",
  );

  const mockConfig: AppConfig = {
    discord: { guildId },
    env: { token: "mock-token" },
    diagnostics: { logLevel: "error", showBanner: false },
    permissions: {
      roles: {},
      policies: {
        everyone: { allow: [], deny: [] },
        privateEveryone: { allow: [], deny: [] },
        privateOwner: { allow: [], deny: [] },
      },
    },
    jtc: {
      anchorCategoryId: "123456789012345670",
      cleanup: { emptyChannelDeleteDelayMs: 0 },
      queue: { concurrency: 1, minTaskDelayMs: 0 },
      categories: {},
      triggers: {},
      categoryOrder: [],
      permissions: { everyonePolicyKey: "everyone", enableOwnerPermissions: false },
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
    categoryManager = new PrivateCategoryManager(mockConfig.privateJtc, stateStore);
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
    ownerId: string;
    userLimit?: number;
  }): VoiceChannel => {
    const overwrites = new Map<string, any>();
    const members = new Collection<string, GuildMember>();

    return {
      id: opts.id,
      name: opts.name,
      userLimit: opts.userLimit ?? 0,
      type: ChannelType.GuildVoice,
      parentId: dynamicCategoryId,
      guild: {
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
      },
      members,
      setName: vi.fn().mockImplementation(async (n: string) => {
        opts.name = n;
      }),
      setUserLimit: vi.fn().mockImplementation(async (l: number) => {
        opts.userLimit = l;
      }),
      permissionOverwrites: {
        cache: overwrites,
        edit: vi.fn().mockImplementation(async (target: any, perms: any) => {
          const id = typeof target === "string" ? target : target.id;
          overwrites.set(id, { id, ...perms });
        }),
        delete: vi.fn().mockImplementation(async (id: string) => {
          overwrites.delete(id);
        }),
      },
    } as unknown as VoiceChannel;
  };

  it("handles room rename, user limit, lock/unlock, hide/unhide, and chat toggle", async () => {
    const channel = createMockVoiceChannel({
      id: "vc-1",
      name: "john's Room",
      ownerId: "owner-1",
    });

    // Register active room
    (service as any).managedRooms.set("vc-1", {
      channelId: "vc-1",
      guildId,
      categoryId: dynamicCategoryId,
      ownerId: "owner-1",
      originalOwnerId: "owner-1",
      isTransferred: false,
      createdAt: new Date().toISOString(),
      joinHistory: [{ userId: "owner-1", joinedAt: new Date().toISOString() }],
      trustedUserIds: [],
      settings: {},
    });

    // 1. Non-owner cannot rename
    const renameFailed = await service.renameRoom(channel, "Hacked Name", "imposter");
    expect(renameFailed).toBe(false);
    expect(channel.setName).not.toHaveBeenCalled();

    // 2. Owner renames
    const renameSuccess = await service.renameRoom(channel, "Study Chill", "owner-1");
    expect(renameSuccess).toBe(true);
    expect(channel.setName).toHaveBeenCalledWith("Study Chill", expect.any(String));

    // 3. Set user limit
    await service.setRoomLimit(channel, 5, "owner-1");
    expect(channel.setUserLimit).toHaveBeenCalledWith(5, expect.any(String));

    // 4. Lock room
    await service.lockRoom(channel, "owner-1");
    expect(channel.permissionOverwrites.edit).toHaveBeenCalledWith(
      expect.objectContaining({ id: guildId }),
      { Connect: false },
    );

    // 5. Unlock room
    await service.unlockRoom(channel, "owner-1");
    expect(channel.permissionOverwrites.edit).toHaveBeenCalledWith(
      expect.objectContaining({ id: guildId }),
      { Connect: null },
    );

    // 6. Hide room
    await service.hideRoom(channel, "owner-1");
    expect(channel.permissionOverwrites.edit).toHaveBeenCalledWith(
      expect.objectContaining({ id: guildId }),
      { ViewChannel: false },
    );

    // 7. Unhide room
    await service.unhideRoom(channel, "owner-1");
    expect(channel.permissionOverwrites.edit).toHaveBeenCalledWith(
      expect.objectContaining({ id: guildId }),
      { ViewChannel: null },
    );

    // 8. Toggle chat
    const chatDisabled = await service.toggleChat(channel, "owner-1");
    expect(chatDisabled).toBe(true);
    expect(channel.permissionOverwrites.edit).toHaveBeenCalledWith(
      expect.objectContaining({ id: guildId }),
      { SendMessages: false },
    );
  });

  it("handles trust and untrust of users", async () => {
    const channel = createMockVoiceChannel({
      id: "vc-1",
      name: "john's Room",
      ownerId: "owner-1",
    });

    (service as any).managedRooms.set("vc-1", {
      channelId: "vc-1",
      guildId,
      categoryId: dynamicCategoryId,
      ownerId: "owner-1",
      originalOwnerId: "owner-1",
      isTransferred: false,
      createdAt: new Date().toISOString(),
      joinHistory: [{ userId: "owner-1", joinedAt: new Date().toISOString() }],
      trustedUserIds: [],
      settings: {},
    });

    // Trust users 2 and 3
    const added = await service.trustUsers(channel, ["user-2", "user-3"], "owner-1");
    expect(added).toEqual(["user-2", "user-3"]);

    const record = service.getManagedRoom("vc-1");
    expect(record?.trustedUserIds).toEqual(["user-2", "user-3"]);
    expect(channel.permissionOverwrites.edit).toHaveBeenCalledWith("user-2", {
      ViewChannel: true,
      Connect: true,
    });
    expect(channel.permissionOverwrites.edit).toHaveBeenCalledWith("user-3", {
      ViewChannel: true,
      Connect: true,
    });

    // Untrust user-2
    const removed = await service.untrustUsers(channel, ["user-2"], "owner-1");
    expect(removed).toEqual(["user-2"]);
    expect(record?.trustedUserIds).toEqual(["user-3"]);
    expect(channel.permissionOverwrites.delete).toHaveBeenCalledWith("user-2");
  });

  it("kicks a member from the voice channel", async () => {
    const channel = createMockVoiceChannel({
      id: "vc-1",
      name: "john's Room",
      ownerId: "owner-1",
    });

    const mockOccupant = {
      id: "user-annoying",
      voice: {
        disconnect: vi.fn().mockResolvedValue(true),
      },
    } as unknown as GuildMember;

    channel.members.set("user-annoying", mockOccupant);

    (service as any).managedRooms.set("vc-1", {
      channelId: "vc-1",
      guildId,
      categoryId: dynamicCategoryId,
      ownerId: "owner-1",
      originalOwnerId: "owner-1",
      isTransferred: false,
      createdAt: new Date().toISOString(),
      joinHistory: [{ userId: "owner-1", joinedAt: new Date().toISOString() }],
      trustedUserIds: [],
      settings: {},
    });

    // Owner kicks user-annoying
    const kicked = await service.kickMember(channel, "user-annoying", "owner-1");
    expect(kicked).toBe(true);
    expect(mockOccupant.voice.disconnect).toHaveBeenCalled();

    // Owner cannot kick self
    const kickSelf = await service.kickMember(channel, "owner-1", "owner-1");
    expect(kickSelf).toBe(false);
  });

  it("handles block and unblock of users, disconnecting occupants and persisting across profiles", async () => {
    const channel = createMockVoiceChannel({
      id: "vc-1",
      name: "john's Room",
      ownerId: "owner-1",
    });

    const mockOccupant = {
      id: "user-blocked",
      user: { tag: "BlockedUser#0001" },
      voice: {
        disconnect: vi.fn().mockResolvedValue(true),
      },
    } as unknown as GuildMember;

    channel.members.set("user-blocked", mockOccupant);

    (service as any).managedRooms.set("vc-1", {
      channelId: "vc-1",
      guildId,
      categoryId: dynamicCategoryId,
      ownerId: "owner-1",
      originalOwnerId: "owner-1",
      isTransferred: false,
      createdAt: new Date().toISOString(),
      joinHistory: [{ userId: "owner-1", joinedAt: new Date().toISOString() }],
      trustedUserIds: ["user-blocked"], // initially trusted
      blockedUserIds: [],
      settings: {},
    });

    // 1. Owner blocks user-blocked
    const added = await service.blockUsers(channel, ["user-blocked"], "owner-1");
    expect(added).toEqual(["user-blocked"]);

    const record = service.getManagedRoom("vc-1");
    expect(record?.blockedUserIds).toEqual(["user-blocked"]);
    // Should have been removed from trustedUserIds
    expect(record?.trustedUserIds).not.toContain("user-blocked");

    // Overwrite set to Connect: false
    expect(channel.permissionOverwrites.edit).toHaveBeenCalledWith("user-blocked", {
      Connect: false,
    });

    // Occupant was in the channel, so disconnect must have been called
    expect(mockOccupant.voice.disconnect).toHaveBeenCalledWith("Blocked by private room owner");

    // Profile was updated
    const profile = (service as any).userProfiles.get("owner-1");
    expect(profile?.blockedUserIds).toEqual(["user-blocked"]);

    // 2. Direct join attempt by blocked member gets immediately disconnected
    await service.handleMemberJoin(mockOccupant, channel);
    expect(mockOccupant.voice.disconnect).toHaveBeenCalledWith("Blocked from this private room");

    // 3. Owner unblocks user-blocked
    const removed = await service.unblockUsers(channel, ["user-blocked"], "owner-1");
    expect(removed).toEqual(["user-blocked"]);
    expect(record?.blockedUserIds).toEqual([]);
    expect(channel.permissionOverwrites.delete).toHaveBeenCalledWith("user-blocked");
    const updatedProfile = (service as any).userProfiles.get("owner-1");
    expect(updatedProfile?.blockedUserIds).toEqual([]);
  });

  it("enforces transferred ownership persistence rule: changes under transferred ownership are NOT saved to disk", async () => {
    const channel = createMockVoiceChannel({
      id: "vc-1",
      name: "john's Room",
      ownerId: "owner-1",
    });

    (service as any).managedRooms.set("vc-1", {
      channelId: "vc-1",
      guildId,
      categoryId: dynamicCategoryId,
      ownerId: "owner-1",
      originalOwnerId: "owner-1",
      isTransferred: false,
      createdAt: new Date().toISOString(),
      joinHistory: [{ userId: "owner-1", joinedAt: new Date().toISOString() }],
      trustedUserIds: [],
      settings: {},
    });

    // 1. Save original baseline state
    await (service as any).saveCurrentState(guildId);
    let onDisk = await stateStore.loadState(guildId, privateAnchorId);
    expect(onDisk?.rooms["vc-1"].ownerId).toBe("owner-1");
    expect(onDisk?.rooms["vc-1"].trustedUserIds).toEqual([]);

    // 2. Transfer ownership to user-2
    await service.transferOwnership(channel, "user-2");
    const activeRecord = service.getManagedRoom("vc-1")!;
    expect(activeRecord.ownerId).toBe("user-2");
    expect(activeRecord.isTransferred).toBe(true);

    // 3. Transferred owner trusts user-99 and changes room limit
    await service.trustUsers(channel, ["user-99"], "user-2");
    await service.setRoomLimit(channel, 8, "user-2");

    // In-memory active state reflects user-2's live changes
    expect(activeRecord.trustedUserIds).toContain("user-99");
    expect(activeRecord.settings?.userLimit).toBe(8);

    // 4. Verify on-disk storage: transferred owner's changes were NOT persisted!
    onDisk = await stateStore.loadState(guildId, privateAnchorId);
    expect(onDisk?.rooms["vc-1"].ownerId).toBe("owner-1"); // Still points to original creator
    expect(onDisk?.rooms["vc-1"].trustedUserIds).toEqual([]); // Transferred trust list was not saved to disk
    expect(onDisk?.rooms["vc-1"].settings?.userLimit).toBeUndefined(); // Transferred settings not saved to disk
  });
});
