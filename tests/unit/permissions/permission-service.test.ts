import { describe, it, expect } from "vitest";
import { PermissionFlagsBits, OverwriteType } from "discord.js";
import {
  PermissionService,
  buildTempPermissionOverwrites,
} from "../../../src/core/permissions/permission-service.js";
import { buildPermissionsConfig } from "../../../config/permissions/permissions.config.js";
import { buildJtcConfig } from "../../../config/jtc/jtc.config.js";

describe("PermissionService & buildTempPermissionOverwrites", () => {
  const guildId = "123456789012345678";
  const quarantineId = "111111111111111111";
  const superFocusId = "222222222222222222";
  const vcRestrictedId = "333333333333333333";

  it("builds temporary JTC permission overwrites with exact @everyone allow and deny flags and no owner overwrite", () => {
    const permissionsConfig = buildPermissionsConfig();
    const jtcConfig = buildJtcConfig();

    const service = new PermissionService(
      permissionsConfig,
      jtcConfig.permissions,
    );

    const overwrites = service.buildJtcRoomOverwrites({
      guildId,
      ownerId: "some-user-id", // Even when ownerId is passed, public JTC has NO owner system!
    });

    // Exactly 1 overwrite (@everyone) when no restricted roles are configured
    expect(overwrites).toHaveLength(1);

    const everyoneOverwrite: any = overwrites.find(
      (o: any) => o.id === guildId,
    );
    expect(everyoneOverwrite).toBeDefined();
    expect(everyoneOverwrite.type).toBe(OverwriteType.Role);

    // Verify all allowed flags
    const expectedAllow = [
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.CreateInstantInvite,
      PermissionFlagsBits.Speak,
      PermissionFlagsBits.Stream,
      PermissionFlagsBits.UseVAD,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.AddReactions,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.SendVoiceMessages,
      PermissionFlagsBits.UseEmbeddedActivities,
      PermissionFlagsBits.UseApplicationCommands,
    ];
    for (const flag of expectedAllow) {
      expect(everyoneOverwrite.allow).toContain(flag);
    }

    // Verify all denied flags
    const expectedDeny = [
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ManageWebhooks,
      PermissionFlagsBits.UseExternalSounds,
      PermissionFlagsBits.PrioritySpeaker,
      PermissionFlagsBits.MuteMembers,
      PermissionFlagsBits.DeafenMembers,
      PermissionFlagsBits.MoveMembers,
      PermissionFlagsBits.MentionEveryone,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.SendPolls,
      PermissionFlagsBits.UseExternalApps,
    ];
    for (const flag of expectedDeny) {
      expect(everyoneOverwrite.deny).toContain(flag);
    }

    // CRITICAL: Ensure NO owner member overwrite exists in public JTC!
    const ownerOverwrite = overwrites.find(
      (o: any) => o.id === "some-user-id",
    );
    expect(ownerOverwrite).toBeUndefined();
  });

  it("applies restricted moderation roles (quarantine, super_focus, vc_restricted) when configured", () => {
    const env: NodeJS.ProcessEnv = {
      ROLE_QUARANTINE_ID: quarantineId,
      ROLE_SUPER_FOCUS_ID: superFocusId,
      ROLE_VC_RESTRICTED_ID: vcRestrictedId,
    };
    const permissionsConfig = buildPermissionsConfig(env);
    const jtcConfig = buildJtcConfig();

    const service = new PermissionService(
      permissionsConfig,
      jtcConfig.permissions,
    );

    const overwrites = service.buildJtcRoomOverwrites({
      guildId,
      ownerId: "some-user-id",
    });

    // 4 overwrites: @everyone + quarantine + super_focus + vc_restricted
    expect(overwrites).toHaveLength(4);

    // 1. Quarantine role
    const quarantineOverwrite: any = overwrites.find(
      (o: any) => o.id === quarantineId,
    );
    expect(quarantineOverwrite).toBeDefined();
    expect(quarantineOverwrite.deny).toEqual([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.CreateInstantInvite,
      PermissionFlagsBits.SendMessages,
    ]);

    // 2. Super focus role
    const superFocusOverwrite: any = overwrites.find(
      (o: any) => o.id === superFocusId,
    );
    expect(superFocusOverwrite).toBeDefined();
    expect(superFocusOverwrite.deny).toEqual([
      PermissionFlagsBits.ViewChannel,
    ]);

    // 3. VC restricted role
    const vcRestrictedOverwrite: any = overwrites.find(
      (o: any) => o.id === vcRestrictedId,
    );
    expect(vcRestrictedOverwrite).toBeDefined();
    expect(vcRestrictedOverwrite.deny).toEqual([
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.SendVoiceMessages,
    ]);
  });

  it("supports passing roles explicitly via options to buildTempPermissionOverwrites", () => {
    const permissionsConfig = buildPermissionsConfig();
    const jtcConfig = buildJtcConfig();

    const service = new PermissionService(
      permissionsConfig,
      jtcConfig.permissions,
    );

    const mockGuild = {
      id: guildId,
      roles: { everyone: { id: guildId } },
    };

    const overwrites = service.buildTempPermissionOverwrites(mockGuild as any, {
      quarantine: quarantineId,
      super_focus: superFocusId,
      vc_restricted: vcRestrictedId,
    });

    expect(overwrites).toHaveLength(4);
    expect(overwrites.some((o: any) => o.id === quarantineId)).toBe(true);
    expect(overwrites.some((o: any) => o.id === superFocusId)).toBe(true);
    expect(overwrites.some((o: any) => o.id === vcRestrictedId)).toBe(true);
    expect(overwrites.some((o: any) => o.id === guildId)).toBe(true);
  });

  it("standalone buildTempPermissionOverwrites function works identically", () => {
    const mockGuild = { id: guildId };
    const overwrites = buildTempPermissionOverwrites(mockGuild as any, {
      quarantine: quarantineId,
    });

    expect(overwrites.length).toBeGreaterThanOrEqual(2);
    expect(overwrites.some((o: any) => o.id === guildId)).toBe(true);
    expect(overwrites.some((o: any) => o.id === quarantineId)).toBe(true);
  });
});
