import { describe, it, expect, vi } from "vitest";
import { RoomCleanupHandler } from "../../../src/modules/jtc/room-cleanup.js";
import type { VoiceChannel } from "discord.js";

describe("RoomCleanupHandler", () => {
  it("aborts cleanup if channel is not deletable", async () => {
    const handler = new RoomCleanupHandler({
      delayMs: 0,
      recheckEmpty: false,
      maxRetries: 1,
      retryDelayMs: 0,
    });

    const mockChannel = {
      id: "c1",
      name: "Solo #1",
      deletable: false,
      members: { size: 0 },
    } as unknown as VoiceChannel;

    const result = await handler.cleanupChannel(mockChannel, () => true);
    expect(result).toBe(false);
  });

  it("aborts cleanup if channel has connected members", async () => {
    const handler = new RoomCleanupHandler({
      delayMs: 0,
      recheckEmpty: false,
      maxRetries: 1,
      retryDelayMs: 0,
    });

    const mockChannel = {
      id: "c1",
      name: "Solo #1",
      deletable: true,
      members: { size: 1 },
    } as unknown as VoiceChannel;

    const result = await handler.cleanupChannel(mockChannel, () => true);
    expect(result).toBe(false);
  });

  it("aborts cleanup if channel is not eligible according to callback", async () => {
    const handler = new RoomCleanupHandler({
      delayMs: 0,
      recheckEmpty: false,
      maxRetries: 1,
      retryDelayMs: 0,
    });

    const mockChannel = {
      id: "c1",
      name: "General Voice",
      deletable: true,
      members: { size: 0 },
    } as unknown as VoiceChannel;

    const result = await handler.cleanupChannel(mockChannel, () => false);
    expect(result).toBe(false);
  });

  it("deletes empty eligible channel and returns true", async () => {
    const deleteMock = vi.fn().mockResolvedValue(undefined);
    const handler = new RoomCleanupHandler({
      delayMs: 0,
      recheckEmpty: false,
      maxRetries: 1,
      retryDelayMs: 0,
    });

    const mockChannel = {
      id: "c1",
      name: "Solo #1",
      deletable: true,
      members: { size: 0 },
      delete: deleteMock,
    } as unknown as VoiceChannel;

    const result = await handler.cleanupChannel(mockChannel, () => true);
    expect(result).toBe(true);
    expect(deleteMock).toHaveBeenCalledTimes(1);
  });
});
