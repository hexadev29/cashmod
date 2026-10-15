import { PermissionFlagsBits } from "discord.js";

export interface RolePermissionPolicy {
  allow: bigint[];
  deny: bigint[];
}

export interface RestrictedRolesConfig {
  quarantineRoleId?: string;
  superFocusRoleId?: string;
  vcRestrictedRoleId?: string;
}

export interface GlobalPermissionsConfig {
  roles?: RestrictedRolesConfig;
  policies: {
    everyone: RolePermissionPolicy;
    quarantine?: RolePermissionPolicy;
    superFocus?: RolePermissionPolicy;
    vcRestricted?: RolePermissionPolicy;
    roomOwner?: RolePermissionPolicy;
    staff?: RolePermissionPolicy;
    privateEveryone?: RolePermissionPolicy;
    privateOwner?: RolePermissionPolicy;
  };
}

export const buildPermissionsConfig = (
  env: NodeJS.ProcessEnv = process.env,
): GlobalPermissionsConfig => {
  return {
    roles: {
      quarantineRoleId: env.ROLE_QUARANTINE_ID ?? "",
      superFocusRoleId: env.ROLE_SUPER_FOCUS_ID ?? "",
      vcRestrictedRoleId: env.ROLE_VC_RESTRICTED_ID ?? "",
    },
    policies: {
      everyone: {
        allow: [
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
        ],
        deny: [
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
        ],
      },
      quarantine: {
        allow: [],
        deny: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.CreateInstantInvite,
          PermissionFlagsBits.SendMessages,
        ],
      },
      superFocus: {
        allow: [],
        deny: [PermissionFlagsBits.ViewChannel],
      },
      vcRestricted: {
        allow: [],
        deny: [
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.SendVoiceMessages,
        ],
      },
      roomOwner: {
        allow: [],
        deny: [],
      },
      staff: {
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
          PermissionFlagsBits.MuteMembers,
          PermissionFlagsBits.DeafenMembers,
          PermissionFlagsBits.MoveMembers,
        ],
        deny: [],
      },
      // Private JTC Policies
      privateEveryone: {
        allow: [
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
          PermissionFlagsBits.UseExternalSounds,
          PermissionFlagsBits.UseExternalEmojis,
          PermissionFlagsBits.UseExternalStickers,
          PermissionFlagsBits.SendTTSMessages,
          PermissionFlagsBits.SendPolls,
          PermissionFlagsBits.UseExternalApps,
        ],
        deny: [
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageRoles,
          PermissionFlagsBits.ManageWebhooks,
          PermissionFlagsBits.MuteMembers,
          PermissionFlagsBits.DeafenMembers,
          PermissionFlagsBits.MoveMembers,
          PermissionFlagsBits.MentionEveryone,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.ManageEvents,
          PermissionFlagsBits.CreateEvents,
        ],
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
  };
};

export const permissionsConfig: GlobalPermissionsConfig =
  buildPermissionsConfig();
