import { describe, it, expect } from "vitest";
import {
  buildPrivateInterfaceMessage,
  buildUntrustPaginationPayload,
  buildUnblockPaginationPayload,
  UNTRUST_PAGE_SIZE,
} from "../../../src/modules/private-jtc/private-interface-builder.js";
import {
  defaultPrivateJtcEmojis,
  type PrivateJtcConfig,
} from "../../../config/private-jtc/private-jtc.config.js";
import { ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder } from "discord.js";

describe("private-interface-builder", () => {
  const mockConfig: PrivateJtcConfig = {
    anchorCategoryId: "123456789012345679",
    triggerChannelId: "200000000000000001",
    categoryName: "Private Rooms",
    roomNameTemplate: "{username}'s Room",
    ownershipTransferDelayMs: 15 * 60 * 1000,
    stateFilePath: "data/test-private-state.json",
    interfaceImagePath: "assets/vc_interface.png",
    embedColor: 0x2b2d31,
    emojis: defaultPrivateJtcEmojis,
  };

  it("builds interface message with transparent embed and 3 rows of 4 buttons in exact order", () => {
    const payload = buildPrivateInterfaceMessage(mockConfig);

    expect(payload.embeds).toBeDefined();
    expect(payload.embeds).toHaveLength(1);

    const embed: any = payload.embeds![0];
    expect(embed.data.color).toBe(0x2b2d31);
    expect(embed.data.image?.url).toBe("attachment://vc_interface.png");

    expect(payload.components).toHaveLength(4);

    // Row 1: Rename, Limit, Lock, Unlock
    const row1 = payload.components![0] as ActionRowBuilder<ButtonBuilder>;
    expect(row1.components).toHaveLength(4);
    expect(row1.components[0].data.custom_id).toBe("pjtc:rename");
    expect(row1.components[0].data.label).toBeUndefined();
    expect(row1.components[0].data.emoji?.id).toBe(defaultPrivateJtcEmojis.rename);

    expect(row1.components[1].data.custom_id).toBe("pjtc:limit");
    expect(row1.components[1].data.label).toBeUndefined();
    expect(row1.components[1].data.emoji?.id).toBe(defaultPrivateJtcEmojis.limit);

    expect(row1.components[2].data.custom_id).toBe("pjtc:lock");
    expect(row1.components[2].data.label).toBeUndefined();
    expect(row1.components[2].data.emoji?.id).toBe(defaultPrivateJtcEmojis.lock);

    expect(row1.components[3].data.custom_id).toBe("pjtc:unlock");
    expect(row1.components[3].data.label).toBeUndefined();
    expect(row1.components[3].data.emoji?.id).toBe(defaultPrivateJtcEmojis.unlock);

    // Row 2: Hide, Unhide, Chat, Trust
    const row2 = payload.components![1] as ActionRowBuilder<ButtonBuilder>;
    expect(row2.components).toHaveLength(4);
    expect(row2.components[0].data.custom_id).toBe("pjtc:hide");
    expect(row2.components[0].data.label).toBeUndefined();
    expect(row2.components[0].data.emoji?.id).toBe(defaultPrivateJtcEmojis.hide);

    expect(row2.components[1].data.custom_id).toBe("pjtc:unhide");
    expect(row2.components[1].data.label).toBeUndefined();
    expect(row2.components[1].data.emoji?.id).toBe(defaultPrivateJtcEmojis.unhide);

    expect(row2.components[2].data.custom_id).toBe("pjtc:chat");
    expect(row2.components[2].data.label).toBeUndefined();
    expect(row2.components[2].data.emoji?.id).toBe(defaultPrivateJtcEmojis.chat);

    expect(row2.components[3].data.custom_id).toBe("pjtc:trust");
    expect(row2.components[3].data.label).toBeUndefined();
    expect(row2.components[3].data.emoji?.id).toBe(defaultPrivateJtcEmojis.trust);

    // Row 3: Untrust, Transfer, Invite, Kick
    const row3 = payload.components![2] as ActionRowBuilder<ButtonBuilder>;
    expect(row3.components).toHaveLength(4);
    expect(row3.components[0].data.custom_id).toBe("pjtc:untrust");
    expect(row3.components[0].data.label).toBeUndefined();
    expect(row3.components[0].data.emoji?.id).toBe(defaultPrivateJtcEmojis.untrust);

    expect(row3.components[1].data.custom_id).toBe("pjtc:transfer");
    expect(row3.components[1].data.label).toBeUndefined();
    expect(row3.components[1].data.emoji?.id).toBe(defaultPrivateJtcEmojis.transfer);

    expect(row3.components[2].data.custom_id).toBe("pjtc:invite");
    expect(row3.components[2].data.label).toBeUndefined();
    expect(row3.components[2].data.emoji?.id).toBe(defaultPrivateJtcEmojis.invite);

    expect(row3.components[3].data.custom_id).toBe("pjtc:kick");
    expect(row3.components[3].data.label).toBeUndefined();
    expect(row3.components[3].data.emoji?.id).toBe(defaultPrivateJtcEmojis.kick);

    // Row 4: Block, Unblock
    const row4 = payload.components![3] as ActionRowBuilder<ButtonBuilder>;
    expect(row4.components).toHaveLength(2);
    expect(row4.components[0].data.custom_id).toBe("pjtc:block");
    expect(row4.components[0].data.label).toBeUndefined();
    expect(row4.components[0].data.emoji?.id).toBe(defaultPrivateJtcEmojis.block);

    expect(row4.components[1].data.custom_id).toBe("pjtc:unblock");
    expect(row4.components[1].data.label).toBeUndefined();
    expect(row4.components[1].data.emoji?.id).toBe(defaultPrivateJtcEmojis.unblock);
  });

  describe("buildUntrustPaginationPayload", () => {
    it("handles empty trusted list gracefully", () => {
      const payload = buildUntrustPaginationPayload("vc-1", [], 1, defaultPrivateJtcEmojis);
      expect(payload.content).toContain(defaultPrivateJtcEmojis.cross);
      expect(payload.components).toHaveLength(0);
    });

    it("renders single page without navigation buttons when users <= 25", () => {
      const users = Array.from({ length: 10 }, (_, i) => ({
        id: `user-${i + 1}`,
        tag: `User${i + 1}#0001`,
      }));

      const payload = buildUntrustPaginationPayload("vc-1", users, 1, defaultPrivateJtcEmojis);

      expect(payload.components).toHaveLength(1); // Select menu only, no nav row
      const selectRow = payload.components[0] as ActionRowBuilder<StringSelectMenuBuilder>;
      const selectMenu = selectRow.components[0];
      expect(selectMenu.options).toHaveLength(10);
    });

    it("paginates lists > 25 users into pages of 25 with Prev/Next buttons", () => {
      // 40 users -> 2 pages (Page 1: 25 users, Page 2: 15 users)
      const users = Array.from({ length: 40 }, (_, i) => ({
        id: `user-${i + 1}`,
        tag: `User${i + 1}#0001`,
      }));

      // Page 1
      const page1 = buildUntrustPaginationPayload("vc-1", users, 1, defaultPrivateJtcEmojis);
      expect(page1.components).toHaveLength(2); // Select menu + Navigation row

      const menu1 = (page1.components[0] as ActionRowBuilder<StringSelectMenuBuilder>).components[0];
      expect(menu1.options).toHaveLength(UNTRUST_PAGE_SIZE); // 25 users

      const navRow1 = page1.components[1] as ActionRowBuilder<ButtonBuilder>;
      expect(navRow1.components[0].data.disabled).toBe(true); // Prev disabled on page 1
      expect(navRow1.components[2].data.disabled).toBe(false); // Next enabled
      expect(navRow1.components[2].data.custom_id).toBe("pjtc:untrust_page:vc-1:2");

      // Page 2
      const page2 = buildUntrustPaginationPayload("vc-1", users, 2, defaultPrivateJtcEmojis);
      const menu2 = (page2.components[0] as ActionRowBuilder<StringSelectMenuBuilder>).components[0];
      expect(menu2.options).toHaveLength(15); // Remaining 15 users

      const navRow2 = page2.components[1] as ActionRowBuilder<ButtonBuilder>;
      expect(navRow2.components[0].data.disabled).toBe(false); // Prev enabled
      expect(navRow2.components[0].data.custom_id).toBe("pjtc:untrust_page:vc-1:1");
      expect(navRow2.components[2].data.disabled).toBe(true); // Next disabled on page 2
    });
  });

  describe("buildUnblockPaginationPayload", () => {
    it("handles empty blocked list gracefully", () => {
      const payload = buildUnblockPaginationPayload("vc-1", [], 1, defaultPrivateJtcEmojis);
      expect(payload.content).toContain(defaultPrivateJtcEmojis.cross);
      expect(payload.components).toHaveLength(0);
    });

    it("paginates blocked lists > 25 users into pages of 25 with Prev/Next buttons", () => {
      const users = Array.from({ length: 30 }, (_, i) => ({
        id: `blocked-${i + 1}`,
        tag: `Blocked${i + 1}#0001`,
      }));

      const page1 = buildUnblockPaginationPayload("vc-1", users, 1, defaultPrivateJtcEmojis);
      expect(page1.components).toHaveLength(2);
      expect(page1.content).toContain(defaultPrivateJtcEmojis.unblock);

      const navRow1 = page1.components[1] as ActionRowBuilder<ButtonBuilder>;
      expect(navRow1.components[0].data.disabled).toBe(true);
      expect(navRow1.components[2].data.disabled).toBe(false);
      expect(navRow1.components[2].data.custom_id).toBe("pjtc:unblock_page:vc-1:2");
    });
  });
});
