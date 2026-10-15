import { describe, it, expect, vi, beforeEach } from "vitest";
import { PrivateJtcInteractionManager } from "../../../src/modules/private-jtc/private-jtc-interaction-manager.js";
import { defaultPrivateJtcEmojis } from "../../../config/private-jtc/private-jtc.config.js";

describe("PrivateJtcInteractionManager (Domain Module)", () => {
  const guildId = "123456789012345678";
  const channelId = "999000111222333444";
  const ownerId = "owner-user-1";
  const imposterId = "hacker-user-2";

  const mockConfig: any = {
    emojis: defaultPrivateJtcEmojis,
  };

  let mockService: any;
  let mockChannel: any;
  let manager: PrivateJtcInteractionManager;

  beforeEach(() => {
    mockChannel = {
      id: channelId,
      name: "john's Room",
      userLimit: 2,
      isVoiceBased: () => true,
      guild: {
        id: guildId,
        members: {
          fetch: vi.fn().mockImplementation(async (id: string) => ({
            id,
            user: { tag: `User${id}#0001` },
          })),
        },
      },
      members: new Map(),
      createInvite: vi.fn().mockResolvedValue({ url: "https://discord.gg/mock" }),
    };

    mockService = {
      getManagedRoom: vi.fn().mockImplementation((id: string) => {
        if (id === channelId) {
          return {
            channelId,
            guildId,
            ownerId,
            trustedUserIds: ["trusted-1"],
          };
        }
        return undefined;
      }),
      renameRoom: vi.fn().mockResolvedValue(true),
      setRoomLimit: vi.fn().mockResolvedValue(true),
      lockRoom: vi.fn().mockResolvedValue(true),
      unlockRoom: vi.fn().mockResolvedValue(true),
      hideRoom: vi.fn().mockResolvedValue(true),
      unhideRoom: vi.fn().mockResolvedValue(true),
      toggleChat: vi.fn().mockResolvedValue(true),
      trustUsers: vi.fn().mockResolvedValue(["trusted-2"]),
      untrustUsers: vi.fn().mockResolvedValue(["trusted-1"]),
      transferOwnership: vi.fn().mockResolvedValue(true),
      kickMember: vi.fn().mockResolvedValue(true),
    };

    manager = new PrivateJtcInteractionManager(mockConfig, mockService);
  });

  const createMockButtonInteraction = (opts: {
    customId: string;
    userId: string;
  }) => {
    return {
      customId: opts.customId,
      user: { id: opts.userId },
      channel: mockChannel,
      isButton: () => true,
      isModalSubmit: () => false,
      isUserSelectMenu: () => false,
      isStringSelectMenu: () => false,
      showModal: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    } as any;
  };

  it("isPrivateJtcInteraction checks pjtc: prefix accurately", () => {
    expect(manager.isPrivateJtcInteraction({ customId: "pjtc:lock" } as any)).toBe(true);
    expect(manager.isPrivateJtcInteraction({ customId: "other:action" } as any)).toBe(false);
    expect(manager.isPrivateJtcInteraction({} as any)).toBe(false);
  });

  it("rejects non-owner interactions with an ephemeral cross message", async () => {
    const interaction = createMockButtonInteraction({
      customId: "pjtc:lock",
      userId: imposterId,
    });

    await manager.handleInteraction(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining(defaultPrivateJtcEmojis.cross),
        ephemeral: true,
      }),
    );
    expect(mockService.lockRoom).not.toHaveBeenCalled();
  });

  it("shows modals on rename and limit button clicks", async () => {
    const renameBtn = createMockButtonInteraction({ customId: "pjtc:rename", userId: ownerId });
    await manager.handleInteraction(renameBtn);
    expect(renameBtn.showModal).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ custom_id: "pjtc:modal_rename" }),
      }),
    );

    const limitBtn = createMockButtonInteraction({ customId: "pjtc:limit", userId: ownerId });
    await manager.handleInteraction(limitBtn);
    expect(limitBtn.showModal).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ custom_id: "pjtc:modal_limit" }),
      }),
    );
  });

  it("dispatches lock, unlock, hide, unhide, chat, and invite buttons", async () => {
    const lockBtn = createMockButtonInteraction({ customId: "pjtc:lock", userId: ownerId });
    await manager.handleInteraction(lockBtn);
    expect(mockService.lockRoom).toHaveBeenCalledWith(mockChannel, ownerId);

    const unlockBtn = createMockButtonInteraction({ customId: "pjtc:unlock", userId: ownerId });
    await manager.handleInteraction(unlockBtn);
    expect(mockService.unlockRoom).toHaveBeenCalledWith(mockChannel, ownerId);

    const hideBtn = createMockButtonInteraction({ customId: "pjtc:hide", userId: ownerId });
    await manager.handleInteraction(hideBtn);
    expect(mockService.hideRoom).toHaveBeenCalledWith(mockChannel, ownerId);

    const unhideBtn = createMockButtonInteraction({ customId: "pjtc:unhide", userId: ownerId });
    await manager.handleInteraction(unhideBtn);
    expect(mockService.unhideRoom).toHaveBeenCalledWith(mockChannel, ownerId);

    const chatBtn = createMockButtonInteraction({ customId: "pjtc:chat", userId: ownerId });
    await manager.handleInteraction(chatBtn);
    expect(mockService.toggleChat).toHaveBeenCalledWith(mockChannel, ownerId);

    const inviteBtn = createMockButtonInteraction({ customId: "pjtc:invite", userId: ownerId });
    await manager.handleInteraction(inviteBtn);
    expect(mockChannel.createInvite).toHaveBeenCalled();
  });

  it("renders untrust pagination and handles navigation button updates", async () => {
    const untrustBtn = createMockButtonInteraction({ customId: "pjtc:untrust", userId: ownerId });
    await manager.handleInteraction(untrustBtn);
    expect(untrustBtn.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        ephemeral: true,
      }),
    );

    const pageBtn = createMockButtonInteraction({
      customId: `pjtc:untrust_page:${channelId}:2`,
      userId: ownerId,
    });
    await manager.handleInteraction(pageBtn);
    expect(pageBtn.update).toHaveBeenCalled();
  });

  it("handles modal submissions, user selects, and string selects", async () => {
    // 1. Rename modal
    const renameModal = {
      customId: "pjtc:modal_rename",
      user: { id: ownerId },
      channel: mockChannel,
      isButton: () => false,
      isModalSubmit: () => true,
      isUserSelectMenu: () => false,
      isStringSelectMenu: () => false,
      fields: { getTextInputValue: vi.fn().mockReturnValue("New Room") },
      reply: vi.fn().mockResolvedValue(undefined),
    } as any;
    await manager.handleInteraction(renameModal);
    expect(mockService.renameRoom).toHaveBeenCalledWith(mockChannel, "New Room", ownerId);

    // 2. Limit modal
    const limitModal = {
      customId: "pjtc:modal_limit",
      user: { id: ownerId },
      channel: mockChannel,
      isButton: () => false,
      isModalSubmit: () => true,
      isUserSelectMenu: () => false,
      isStringSelectMenu: () => false,
      fields: { getTextInputValue: vi.fn().mockReturnValue("8") },
      reply: vi.fn().mockResolvedValue(undefined),
    } as any;
    await manager.handleInteraction(limitModal);
    expect(mockService.setRoomLimit).toHaveBeenCalledWith(mockChannel, 8, ownerId);

    // 3. Trust user select
    const trustSelect = {
      customId: "pjtc:trust_select",
      user: { id: ownerId },
      channel: mockChannel,
      isButton: () => false,
      isModalSubmit: () => false,
      isUserSelectMenu: () => true,
      isStringSelectMenu: () => false,
      values: ["target-1", "target-2"],
      reply: vi.fn().mockResolvedValue(undefined),
    } as any;
    await manager.handleInteraction(trustSelect);
    expect(mockService.trustUsers).toHaveBeenCalledWith(mockChannel, ["target-1", "target-2"], ownerId);

    // 4. Untrust string select
    const untrustSelect = {
      customId: "pjtc:untrust_select",
      user: { id: ownerId },
      channel: mockChannel,
      isButton: () => false,
      isModalSubmit: () => false,
      isUserSelectMenu: () => false,
      isStringSelectMenu: () => true,
      values: ["trusted-1"],
      reply: vi.fn().mockResolvedValue(undefined),
    } as any;
    await manager.handleInteraction(untrustSelect);
    expect(mockService.untrustUsers).toHaveBeenCalledWith(mockChannel, ["trusted-1"], ownerId);
  });
});
