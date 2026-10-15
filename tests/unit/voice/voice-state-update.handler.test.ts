import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VoiceState, VoiceChannel, GuildMember } from "discord.js";
import { voiceStateUpdateHandler } from "../../../src/handlers/voice/voice-state-update.handler.js";
import * as jtcInstance from "../../../src/modules/jtc/jtc-instance.js";
import * as loadConfigModule from "../../../src/core/config/load-config.js";

describe("voiceStateUpdateHandler", () => {
  const guildId = "123456789012345678";
  const triggerChannelId = "100000000000000001";
  const jtcRoomChannelId = "999999999999999999";

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
  };

  let mockJtcService: any;

  beforeEach(() => {
    vi.spyOn(loadConfigModule, "loadConfig").mockReturnValue(mockConfig);

    mockJtcService = {
      queueVoiceJoin: vi.fn().mockResolvedValue(null),
      queueDirectJoin: vi.fn().mockResolvedValue(undefined),
      queueVoiceLeave: vi.fn().mockResolvedValue(true),
      isEligibleJtcChannel: vi.fn().mockImplementation((ch: VoiceChannel) => {
        return ch.id === jtcRoomChannelId;
      }),
    };

    vi.spyOn(jtcInstance, "getJtcService").mockReturnValue(mockJtcService);
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
});
