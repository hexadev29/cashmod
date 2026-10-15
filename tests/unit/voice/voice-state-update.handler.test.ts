import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VoiceState, VoiceChannel, GuildMember } from "discord.js";
import { voiceStateUpdateHandler } from "../../../src/handlers/voice/voice-state-update.handler.js";
import * as jtcInstance from "../../../src/modules/jtc/jtc-instance.js";
import * as privateJtcInstance from "../../../src/modules/private-jtc/private-jtc-instance.js";
import * as loadConfigModule from "../../../src/core/config/load-config.js";

describe("voiceStateUpdateHandler", () => {
  const guildId = "123456789012345678";
  const triggerChannelId = "100000000000000001";
  const jtcRoomChannelId = "999999999999999999";
  const privateTriggerChannelId = "100000000000000002";
  const privateRoomChannelId = "888888888888888888";

  const mockConfig: any = {
    discord: { guildId },
    jtc: {
      triggers: {
        [triggerChannelId]: {
          triggerChannelId,
          categoryName: "Solo",
        },
      },
    },
    privateJtc: {
      triggerChannelId: privateTriggerChannelId,
      anchorCategoryId: "123456789012345679",
    },
  };

  let mockJtcService: any;
  let mockPrivateJtcService: any;

  beforeEach(() => {
    vi.spyOn(loadConfigModule, "loadConfig").mockReturnValue(mockConfig);

    mockJtcService = {
      queueVoiceJoin: vi.fn().mockResolvedValue(null),
      queueDirectJoin: vi.fn().mockResolvedValue(undefined),
      queueVoiceLeave: vi.fn().mockResolvedValue(true),
      isManagedRoom: vi.fn().mockImplementation((id: string) => id === jtcRoomChannelId),
      isEligibleJtcChannel: vi.fn().mockImplementation((ch: VoiceChannel) => {
        return ch.id === jtcRoomChannelId;
      }),
    };

    mockPrivateJtcService = {
      queueVoiceJoin: vi.fn().mockResolvedValue(null),
      queueMemberJoin: vi.fn().mockResolvedValue(undefined),
      queueVoiceLeave: vi.fn().mockResolvedValue(undefined),
      isManagedRoom: vi.fn().mockImplementation((id: string) => id === privateRoomChannelId),
      isEligiblePrivateChannel: vi.fn().mockImplementation((ch: VoiceChannel) => {
        return ch.id === privateRoomChannelId;
      }),
    };

    vi.spyOn(jtcInstance, "getJtcService").mockReturnValue(mockJtcService);
    vi.spyOn(privateJtcInstance, "getPrivateJtcService").mockReturnValue(mockPrivateJtcService);
  });

  const createMockVoiceState = (opts: {
    guildId?: string;
    channelId: string | null;
    isBot?: boolean;
    isVoiceBased?: boolean;
  }): VoiceState => {
    const member = {
      id: "member-1",
      user: { id: "member-1", bot: opts.isBot ?? false },
    } as unknown as GuildMember;

    const channel = opts.channelId
      ? ({
          id: opts.channelId,
          name: opts.channelId === jtcRoomChannelId ? "Solo #3" : "Some VC",
          isVoiceBased: () => opts.isVoiceBased ?? true,
        } as unknown as VoiceChannel)
      : null;

    return {
      guild: { id: opts.guildId ?? guildId },
      channelId: opts.channelId,
      channel,
      member,
    } as unknown as VoiceState;
  };

  it("ignores transitions from other guilds", async () => {
    const oldState = createMockVoiceState({ guildId: "foreign-guild", channelId: null });
    const newState = createMockVoiceState({ guildId: "foreign-guild", channelId: triggerChannelId });

    await voiceStateUpdateHandler.execute(oldState, newState);

    expect(mockJtcService.queueVoiceJoin).not.toHaveBeenCalled();
    expect(mockJtcService.queueDirectJoin).not.toHaveBeenCalled();
  });

  it("ignores transitions for bots", async () => {
    const oldState = createMockVoiceState({ channelId: null, isBot: true });
    const newState = createMockVoiceState({ channelId: triggerChannelId, isBot: true });

    await voiceStateUpdateHandler.execute(oldState, newState);

    expect(mockJtcService.queueVoiceJoin).not.toHaveBeenCalled();
    expect(mockJtcService.queueDirectJoin).not.toHaveBeenCalled();
  });

  it("ignores voice state changes that do not change channels (mute, deafen)", async () => {
    const oldState = createMockVoiceState({ channelId: "ch-1" });
    const newState = createMockVoiceState({ channelId: "ch-1" });

    await voiceStateUpdateHandler.execute(oldState, newState);

    expect(mockJtcService.queueVoiceJoin).not.toHaveBeenCalled();
    expect(mockJtcService.queueVoiceLeave).not.toHaveBeenCalled();
  });

  it("routes trigger channel joins to queueVoiceJoin", async () => {
    const oldState = createMockVoiceState({ channelId: null });
    const newState = createMockVoiceState({ channelId: triggerChannelId });

    await voiceStateUpdateHandler.execute(oldState, newState);

    expect(mockJtcService.queueVoiceJoin).toHaveBeenCalledWith(
      newState.member,
      triggerChannelId,
    );
    expect(mockJtcService.queueDirectJoin).not.toHaveBeenCalled();
  });

  it("routes direct clicks on eligible JTC rooms to queueDirectJoin", async () => {
    const oldState = createMockVoiceState({ channelId: null });
    const newState = createMockVoiceState({ channelId: jtcRoomChannelId });

    await voiceStateUpdateHandler.execute(oldState, newState);

    expect(mockJtcService.queueDirectJoin).toHaveBeenCalledWith(
      newState.member,
      newState.channel,
    );
    expect(mockJtcService.queueVoiceJoin).not.toHaveBeenCalled();
  });

  it("routes channel leaves to queueVoiceLeave", async () => {
    const oldState = createMockVoiceState({ channelId: jtcRoomChannelId });
    const newState = createMockVoiceState({ channelId: null });

    await voiceStateUpdateHandler.execute(oldState, newState);

    expect(mockJtcService.queueVoiceLeave).toHaveBeenCalledWith(oldState.channel);
  });

  it("routes private trigger channel joins to privateJtcService.queueVoiceJoin", async () => {
    const oldState = createMockVoiceState({ channelId: null });
    const newState = createMockVoiceState({ channelId: privateTriggerChannelId });

    await voiceStateUpdateHandler.execute(oldState, newState);

    expect(mockPrivateJtcService.queueVoiceJoin).toHaveBeenCalledWith(
      newState.member,
      privateTriggerChannelId,
    );
    expect(mockJtcService.queueVoiceJoin).not.toHaveBeenCalled();
  });

  it("routes direct clicks on eligible private JTC rooms to privateJtcService.queueMemberJoin", async () => {
    const oldState = createMockVoiceState({ channelId: null });
    const newState = createMockVoiceState({ channelId: privateRoomChannelId });

    await voiceStateUpdateHandler.execute(oldState, newState);

    expect(mockPrivateJtcService.queueMemberJoin).toHaveBeenCalledWith(
      newState.member,
      newState.channel,
    );
  });

  it("routes private room leaves to privateJtcService.queueVoiceLeave", async () => {
    const oldState = createMockVoiceState({ channelId: privateRoomChannelId });
    const newState = createMockVoiceState({ channelId: null });

    await voiceStateUpdateHandler.execute(oldState, newState);

    expect(mockPrivateJtcService.queueVoiceLeave).toHaveBeenCalledWith(
      oldState.channel,
      oldState.member,
    );
  });
});
