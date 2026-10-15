import { describe, it, expect, vi, beforeEach } from "vitest";
import { JtcService } from "../../../src/modules/jtc/jtc-service.js";
import { PermissionService } from "../../../src/core/permissions/permission-service.js";
import type { AppConfig } from "../../../src/core/config/config-types.js";
import { JTC_CATEGORY_ORDER } from "../../../config/jtc/jtc.config.js";
import type { Guild, GuildMember, VoiceChannel } from "discord.js";

const createMockConfig = (): AppConfig => ({
  env: { nodeEnv: "test", token: "mock-token" },
  discord: { guildId: "123456789012345678", clientOptions: { intents: [] } },
  permissions: {
    policies: {
      everyone: { allow: [1n], deny: [] },
      roomOwner: { allow: [2n], deny: [] },
    },
  },
  jtc: {
    categoryOrder: JTC_CATEGORY_ORDER,
    categories: {
      Solo: { name: "Solo", categoryId: "111111111111111111", userLimit: 1 },
      Duo: { name: "Duo", categoryId: "222222222222222222", userLimit: 2 },
      Trio: { name: "Trio", categoryId: "333333333333333333", userLimit: 3 },
      Quad: { name: "Quad", categoryId: "444444444444444444", userLimit: 4 },
      Penta: { name: "Penta", categoryId: "555555555555555555", userLimit: 5 },
      Hexa: { name: "Hexa", categoryId: "666666666666666666", userLimit: 6 },
      Septa: { name: "Septa", categoryId: "777777777777777777", userLimit: 7 },
      Octa: { name: "Octa", categoryId: "888888888888888888", userLimit: 8 },
    },
    triggers: {
      "100000000000000001": {
        triggerChannelId: "100000000000000001",
        categoryName: "Solo",
        roomNameTemplate: "Solo #{number}",
        userLimit: 1,
      },
    },
    namingRegex: /^(Solo|Duo|Trio|Quad|Penta|Hexa|Septa|Octa)\s+#(\d+)$/i,
    positioning: {},
    cleanup: {
      delayMs: 0,
      recheckEmpty: false,
      maxRetries: 1,
      retryDelayMs: 0,
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
  let service: JtcService;
  let createdChannels: Map<string, any>;
  let channelCounter = 0;

  beforeEach(() => {
    config = createMockConfig();
    permissionService = new PermissionService(
      config.permissions,
      config.jtc.permissions,
    );
    service = new JtcService(config, permissionService);
    createdChannels = new Map();
    channelCounter = 0;
  });

  const createMockGuild = (): Guild => {
    const guild = {
      id: config.discord.guildId,
      name: "Test Guild",
      channels: {
        fetch: vi.fn().mockImplementation(async () => createdChannels),
        create: vi.fn().mockImplementation(async (opts: any) => {
          channelCounter++;
          const chId = `created-ch-${channelCounter}`;
          const newCh = {
            id: chId,
            name: opts.name,
            parentId: opts.parent,
            position: opts.position ?? 0,
            userLimit: opts.userLimit,
            isVoiceBased: () => true,
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

  it("allocates room #1 on first join and moves member", async () => {
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
  });

  it("compensates and deletes channel if moving member fails", async () => {
    const guild = createMockGuild();
    const member = createMockMember("m2", guild, true); // failMove = true

    const result = await service.handleVoiceJoin(member, "100000000000000001");

    expect(result).toBeNull();
    // Verify created channel was deleted during compensation
    expect(createdChannels.size).toBe(0);
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

  it("cleans up empty managed room on voice leave", async () => {
    const guild = createMockGuild();
    const member = createMockMember("m3", guild);

    const alloc = await service.handleVoiceJoin(member, "100000000000000001");
    expect(alloc).not.toBeNull();

    const channel = alloc!.channel as any;
    // Simulate member leaving -> size becomes 0
    channel.members.size = 0;

    const cleaned = await service.handleVoiceLeave(channel as VoiceChannel);
    expect(cleaned).toBe(true);
    expect(channel.delete).toHaveBeenCalled();
    expect(service.isManagedRoom(channel.id)).toBe(false);
  });
});
