import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ChannelType,
  Collection,
  OverwriteType,
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

describe("Private JTC — User Profile Persistence & Restoration", () => {
  const guildId = "123456789012345678";
  const privateAnchorId = "123456789012345679";
  const privateTriggerId = "100000000000000005";
  const dynamicCategoryId = "200000000000000001";
  const testStatePath = path.resolve(
    process.cwd(),
    "data/test-private-jtc-restoration.json",
  );

  const mockConfig: AppConfig = {
    discord: { guildId },
    env: { token: "mock-token" },
    diagnostics: { logLevel: "error", showBanner: false },
    permissions: {
      roles: {
        quarantineRoleId: "900000000000000001",
        superFocusRoleId: "900000000000000002",
        vcRestrictedRoleId: "900000000000000003",
      },
      policies: {
        everyone: { allow: [], deny: [] },
        privateEveryone: {
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.SendMessages,
          ],
          deny: [],
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
    userLimit?: number;
    parentId?: string;
    guild: any;
  }): VoiceChannel => {
    const overwrites = new Map<string, any>();
    const members = new Collection<string, GuildMember>();

    return {
      id: opts.id,
      name: opts.name,
      userLimit: opts.userLimit ?? 0,
      type: ChannelType.GuildVoice,
      parentId: opts.parentId ?? dynamicCategoryId,
      guild: opts.guild,
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
      delete: vi.fn().mockResolvedValue(true),
      send: vi.fn().mockResolvedValue({ id: "msg-1" }),
    } as unknown as VoiceChannel;
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

  it("persists original owner changes into user profile and restores them when creating a new VC", async () => {
    const { guild, channels } = createMockGuild();

    // 1. Mock CategoryManager
    vi.spyOn(categoryManager, "getOrCreateCategory").mockResolvedValue(dynamicCategoryId);

    // 2. User 'owner-alice' joins private trigger for the first time
    const aliceMember = {
      id: "owner-alice",
      user: { tag: "Alice#0001", username: "Alice" },
      guild,
      voice: { setChannel: vi.fn().mockResolvedValue(true) },
    } as unknown as GuildMember;

    const initialRecord = await service.handleVoiceJoin(aliceMember, privateTriggerId);
    expect(initialRecord).not.toBeNull();
    const firstChannelId = initialRecord!.channelId;
    const firstChannel = channels.get(firstChannelId)!;

    // Check defaults
    expect(firstChannel.name).toBe("Alice's Room");
    expect(firstChannel.userLimit).toBe(0);

    // 3. Alice customizes her private room:
    //    - renames room to "Alice's Secret Lounge"
    //    - sets user limit to 5
    //    - locks room
    //    - hides room
    //    - disables chat
    //    - trusts Bob ('user-bob') and Charlie ('user-charlie')
    await service.renameRoom(firstChannel, "Alice's Secret Lounge", "owner-alice");
    await service.setRoomLimit(firstChannel, 5, "owner-alice");
    await service.lockRoom(firstChannel, "owner-alice");
    await service.hideRoom(firstChannel, "owner-alice");
    await service.toggleChat(firstChannel, "owner-alice");
    await service.trustUsers(firstChannel, ["user-bob", "user-charlie"], "owner-alice");

    // Verify in-memory user profile
    const profile = service.getUserProfile("owner-alice");
    expect(profile).toBeDefined();
    expect(profile?.customName).toBe("Alice's Secret Lounge");
    expect(profile?.userLimit).toBe(5);
    expect(profile?.locked).toBe(true);
    expect(profile?.hidden).toBe(true);
    expect(profile?.chatDisabled).toBe(true);
    expect(profile?.trustedUserIds).toEqual(["user-bob", "user-charlie"]);

    // Verify persisted document on disk
    let onDisk = await stateStore.loadState(guildId, privateAnchorId);
    expect(onDisk?.userProfiles?.["owner-alice"]).toBeDefined();
    expect(onDisk?.userProfiles?.["owner-alice"].customName).toBe("Alice's Secret Lounge");
    expect(onDisk?.userProfiles?.["owner-alice"].userLimit).toBe(5);
    expect(onDisk?.userProfiles?.["owner-alice"].locked).toBe(true);
    expect(onDisk?.userProfiles?.["owner-alice"].hidden).toBe(true);
    expect(onDisk?.userProfiles?.["owner-alice"].chatDisabled).toBe(true);
    expect(onDisk?.userProfiles?.["owner-alice"].trustedUserIds).toEqual(["user-bob", "user-charlie"]);

    // 4. Room empties and is deleted
    firstChannel.members.clear();
    await service.handleVoiceLeave(firstChannel);
    expect(service.isManagedRoom(firstChannelId)).toBe(false);

    // Verify profile is STILL preserved on disk after room deletion
    onDisk = await stateStore.loadState(guildId, privateAnchorId);
    expect(onDisk?.userProfiles?.["owner-alice"]).toBeDefined();

    // 5. Alice joins the private trigger AGAIN!
    const secondRecord = await service.handleVoiceJoin(aliceMember, privateTriggerId);
    expect(secondRecord).not.toBeNull();
    const secondChannelId = secondRecord!.channelId;
    const secondChannel = channels.get(secondChannelId)!;

    // Verify RESTORATION of:
    // a) Room Name
    expect(secondChannel.name).toBe("Alice's Secret Lounge");

    // b) User Limit
    expect(secondChannel.userLimit).toBe(5);

    // c) Initialized record settings & trust
    expect(secondRecord?.trustedUserIds).toEqual(["user-bob", "user-charlie"]);
    expect(secondRecord?.settings?.name).toBe("Alice's Secret Lounge");
    expect(secondRecord?.settings?.userLimit).toBe(5);
    expect(secondRecord?.settings?.locked).toBe(true);
    expect(secondRecord?.settings?.hidden).toBe(true);
    expect(secondRecord?.settings?.chatDisabled).toBe(true);

    // d) Permission overwrites passed to channels.create
    const overwrites: any[] = (secondChannel as any).permissionOverwritesPayload;
    expect(overwrites).toBeDefined();

    // @everyone overwrite: Connect, ViewChannel, and SendMessages denied due to locked, hidden, chatDisabled
    const everyoneOw = overwrites.find((o) => o.id === guildId);
    expect(everyoneOw).toBeDefined();
    expect(everyoneOw.deny).toContain(PermissionFlagsBits.Connect);
    expect(everyoneOw.deny).toContain(PermissionFlagsBits.ViewChannel);
    expect(everyoneOw.deny).toContain(PermissionFlagsBits.SendMessages);

    // Owner overwrite: ViewChannel, Connect, SendMessages allowed
    const ownerOw = overwrites.find((o) => o.id === "owner-alice");
    expect(ownerOw).toBeDefined();
    expect(ownerOw.allow).toContain(PermissionFlagsBits.ViewChannel);
    expect(ownerOw.allow).toContain(PermissionFlagsBits.Connect);
    expect(ownerOw.allow).toContain(PermissionFlagsBits.SendMessages);

    // Trusted users: Bob and Charlie granted explicit allows
    const bobOw = overwrites.find((o) => o.id === "user-bob");
    expect(bobOw).toBeDefined();
    expect(bobOw.type).toBe(OverwriteType.Member);
    expect(bobOw.allow).toContain(PermissionFlagsBits.ViewChannel);
    expect(bobOw.allow).toContain(PermissionFlagsBits.Connect);

    const charlieOw = overwrites.find((o) => o.id === "user-charlie");
    expect(charlieOw).toBeDefined();
    expect(charlieOw.type).toBe(OverwriteType.Member);
    expect(charlieOw.allow).toContain(PermissionFlagsBits.ViewChannel);
  });

  it("does not apply another user's saved profile to a new user", async () => {
    const { guild, channels } = createMockGuild();
    vi.spyOn(categoryManager, "getOrCreateCategory").mockResolvedValue(dynamicCategoryId);

    // Pre-populate Alice's profile
    service.setUserProfile("owner-alice", {
      customName: "Alice's Pad",
      userLimit: 3,
      locked: true,
      hidden: true,
      chatDisabled: true,
      trustedUserIds: ["friend-1"],
    });

    // Dave joins for the first time
    const daveMember = {
      id: "owner-dave",
      user: { tag: "Dave#0002", username: "Dave" },
      guild,
      voice: { setChannel: vi.fn().mockResolvedValue(true) },
    } as unknown as GuildMember;

    const daveRecord = await service.handleVoiceJoin(daveMember, privateTriggerId);
    expect(daveRecord).not.toBeNull();
    const daveChannel = channels.get(daveRecord!.channelId)!;

    // Dave gets clean defaults, not Alice's settings
    expect(daveChannel.name).toBe("Dave's Room");
    expect(daveChannel.userLimit).toBe(0);
    expect(daveRecord?.trustedUserIds).toEqual([]);
    expect(daveRecord?.settings?.locked).toBe(false);
  });

  it("restores user profiles across startup reconciliation", async () => {
    // 1. Manually write state store with a saved profile
    await stateStore.saveState(guildId, privateAnchorId, {
      categoryId: dynamicCategoryId,
      rooms: {},
      userProfiles: {
        "user-retro": {
          customName: "Retro Arcade",
          userLimit: 8,
          locked: true,
          hidden: false,
          chatDisabled: false,
          trustedUserIds: ["gamer-1", "gamer-2"],
          updatedAt: new Date().toISOString(),
        },
      },
    });

    const { guild, channels } = createMockGuild();
    vi.spyOn(categoryManager, "initFromState").mockResolvedValue(dynamicCategoryId);
    vi.spyOn(categoryManager, "getOrCreateCategory").mockResolvedValue(dynamicCategoryId);

    // 2. Perform reconciliation (startup)
    await service.reconcile(guild);

    // Verify profile is loaded in memory
    const loadedProf = service.getUserProfile("user-retro");
    expect(loadedProf).toBeDefined();
    expect(loadedProf?.customName).toBe("Retro Arcade");
    expect(loadedProf?.userLimit).toBe(8);

    // 3. User 'user-retro' joins trigger
    const retroMember = {
      id: "user-retro",
      user: { tag: "Retro#0003", username: "Retro" },
      guild,
      voice: { setChannel: vi.fn().mockResolvedValue(true) },
    } as unknown as GuildMember;

    const record = await service.handleVoiceJoin(retroMember, privateTriggerId);
    expect(record).not.toBeNull();
    const channel = channels.get(record!.channelId)!;

    expect(channel.name).toBe("Retro Arcade");
    expect(channel.userLimit).toBe(8);
    expect(record?.trustedUserIds).toEqual(["gamer-1", "gamer-2"]);
    expect(record?.settings?.locked).toBe(true);
  });
});
