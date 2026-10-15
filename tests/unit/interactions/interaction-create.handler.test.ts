import { describe, it, expect, vi, beforeEach } from "vitest";
import { interactionCreateHandler } from "../../../src/handlers/interactions/interaction-create.handler.js";
import * as privateJtcInstance from "../../../src/modules/private-jtc/private-jtc-instance.js";
import * as loadConfigModule from "../../../src/core/config/load-config.js";
import { defaultPrivateJtcEmojis } from "../../../config/private-jtc/private-jtc.config.js";

describe("interactionCreateHandler", () => {
  const guildId = "123456789012345678";
  const channelId = "999000111222333444";
  const ownerId = "owner-user-1";
  const imposterId = "hacker-user-2";

  const mockConfig: any = {
    discord: { guildId },
    privateJtc: {
      emojis: defaultPrivateJtcEmojis,
    },
  };

  let mockPrivateJtcService: any;
  let mockChannel: any;

  beforeEach(() => {
    vi.spyOn(loadConfigModule, "loadConfig").mockReturnValue(mockConfig);

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

    mockPrivateJtcService = {
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

    vi.spyOn(privateJtcInstance, "getPrivateJtcService").mockReturnValue(mockPrivateJtcService);
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

  it("ignores interactions with customId not starting with pjtc:", async () => {
    const interaction = createMockButtonInteraction({
      customId: "some_other_custom_id",
      userId: ownerId,
    });

    await interactionCreateHandler.execute(interaction);

    expect(interaction.reply).not.toHaveBeenCalled();
    expect(mockPrivateJtcService.getManagedRoom).not.toHaveBeenCalled();
  });

  it("rejects non-owner interactions with an ephemeral cross message", async () => {
    const interaction = createMockButtonInteraction({
      customId: "pjtc:lock",
      userId: imposterId,
    });

    await interactionCreateHandler.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining(defaultPrivateJtcEmojis.cross),
        ephemeral: true,
      }),
    );
    expect(mockPrivateJtcService.lockRoom).not.toHaveBeenCalled();
  });

  it("shows modal when owner clicks pjtc:rename", async () => {
    const interaction = createMockButtonInteraction({
      customId: "pjtc:rename",
      userId: ownerId,
    });

    await interactionCreateHandler.execute(interaction);

    expect(interaction.showModal).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          custom_id: "pjtc:modal_rename",
        }),
      }),
    );
  });

  it("shows modal when owner clicks pjtc:limit", async () => {
    const interaction = createMockButtonInteraction({
      customId: "pjtc:limit",
      userId: ownerId,
    });

    await interactionCreateHandler.execute(interaction);

    expect(interaction.showModal).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          custom_id: "pjtc:modal_limit",
        }),
      }),
    );
  });

  it("locks and unlocks room on button clicks", async () => {
    const lockInteraction = createMockButtonInteraction({
      customId: "pjtc:lock",
      userId: ownerId,
    });
    await interactionCreateHandler.execute(lockInteraction);
    expect(mockPrivateJtcService.lockRoom).toHaveBeenCalledWith(mockChannel, ownerId);

    const unlockInteraction = createMockButtonInteraction({
      customId: "pjtc:unlock",
      userId: ownerId,
    });
    await interactionCreateHandler.execute(unlockInteraction);
    expect(mockPrivateJtcService.unlockRoom).toHaveBeenCalledWith(mockChannel, ownerId);
  });

  it("hides, unhides, and toggles chat on button clicks", async () => {
    const hideInteraction = createMockButtonInteraction({
      customId: "pjtc:hide",
      userId: ownerId,
    });
    await interactionCreateHandler.execute(hideInteraction);
    expect(mockPrivateJtcService.hideRoom).toHaveBeenCalledWith(mockChannel, ownerId);

    const unhideInteraction = createMockButtonInteraction({
      customId: "pjtc:unhide",
      userId: ownerId,
    });
    await interactionCreateHandler.execute(unhideInteraction);
    expect(mockPrivateJtcService.unhideRoom).toHaveBeenCalledWith(mockChannel, ownerId);

    const chatInteraction = createMockButtonInteraction({
      customId: "pjtc:chat",
      userId: ownerId,
    });
    await interactionCreateHandler.execute(chatInteraction);
    expect(mockPrivateJtcService.toggleChat).toHaveBeenCalledWith(mockChannel, ownerId);
  });

  it("creates instant invite link on pjtc:invite click", async () => {
    const inviteInteraction = createMockButtonInteraction({
      customId: "pjtc:invite",
      userId: ownerId,
    });
    await interactionCreateHandler.execute(inviteInteraction);

    expect(mockChannel.createInvite).toHaveBeenCalled();
    expect(inviteInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("https://discord.gg/mock"),
        ephemeral: true,
      }),
    );
  });

  it("handles modal submit for pjtc:modal_rename and pjtc:modal_limit", async () => {
    // 1. Rename submit
    const modalRename = {
      customId: "pjtc:modal_rename",
      user: { id: ownerId },
      channel: mockChannel,
      isButton: () => false,
      isModalSubmit: () => true,
      isUserSelectMenu: () => false,
      isStringSelectMenu: () => false,
      fields: {
        getTextInputValue: vi.fn().mockReturnValue("My New VC"),
      },
      reply: vi.fn().mockResolvedValue(undefined),
    } as any;

    await interactionCreateHandler.execute(modalRename);
    expect(mockPrivateJtcService.renameRoom).toHaveBeenCalledWith(mockChannel, "My New VC", ownerId);
    expect(modalRename.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("My New VC"),
        ephemeral: true,
      }),
    );

    // 2. Limit submit
    const modalLimit = {
      customId: "pjtc:modal_limit",
      user: { id: ownerId },
      channel: mockChannel,
      isButton: () => false,
      isModalSubmit: () => true,
      isUserSelectMenu: () => false,
      isStringSelectMenu: () => false,
      fields: {
        getTextInputValue: vi.fn().mockReturnValue("4"),
      },
      reply: vi.fn().mockResolvedValue(undefined),
    } as any;

    await interactionCreateHandler.execute(modalLimit);
    expect(mockPrivateJtcService.setRoomLimit).toHaveBeenCalledWith(mockChannel, 4, ownerId);
  });

  it("handles user select for pjtc:trust_select and pjtc:transfer_select", async () => {
    // Trust select
    const trustSelect = {
      customId: "pjtc:trust_select",
      user: { id: ownerId },
      channel: mockChannel,
      isButton: () => false,
      isModalSubmit: () => false,
      isUserSelectMenu: () => true,
      isStringSelectMenu: () => false,
      values: ["target-user-1", "target-user-2"],
      reply: vi.fn().mockResolvedValue(undefined),
    } as any;

    await interactionCreateHandler.execute(trustSelect);
    expect(mockPrivateJtcService.trustUsers).toHaveBeenCalledWith(
      mockChannel,
      ["target-user-1", "target-user-2"],
      ownerId,
    );

    // Transfer select
    const transferSelect = {
      customId: "pjtc:transfer_select",
      user: { id: ownerId },
      channel: mockChannel,
      isButton: () => false,
      isModalSubmit: () => false,
      isUserSelectMenu: () => true,
      isStringSelectMenu: () => false,
      values: ["new-owner-id"],
      reply: vi.fn().mockResolvedValue(undefined),
    } as any;

    await interactionCreateHandler.execute(transferSelect);
    expect(mockPrivateJtcService.transferOwnership).toHaveBeenCalledWith(
      mockChannel,
      "new-owner-id",
    );
  });

  it("handles untrust string select and kick string select", async () => {
    // Untrust select
    const untrustSelect = {
      customId: "pjtc:untrust_select:vc-1",
      user: { id: ownerId },
      channel: mockChannel,
      isButton: () => false,
      isModalSubmit: () => false,
      isUserSelectMenu: () => false,
      isStringSelectMenu: () => true,
      values: ["trusted-1"],
      reply: vi.fn().mockResolvedValue(undefined),
    } as any;

    await interactionCreateHandler.execute(untrustSelect);
    expect(mockPrivateJtcService.untrustUsers).toHaveBeenCalledWith(
      mockChannel,
      ["trusted-1"],
      ownerId,
    );

    // Kick select
    const kickSelect = {
      customId: "pjtc:kick_select",
      user: { id: ownerId },
      channel: mockChannel,
      isButton: () => false,
      isModalSubmit: () => false,
      isUserSelectMenu: () => false,
      isStringSelectMenu: () => true,
      values: ["annoying-user-id"],
      reply: vi.fn().mockResolvedValue(undefined),
    } as any;

    await interactionCreateHandler.execute(kickSelect);
    expect(mockPrivateJtcService.kickMember).toHaveBeenCalledWith(
      mockChannel,
      "annoying-user-id",
      ownerId,
    );
  });
});
