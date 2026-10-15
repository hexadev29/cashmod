import { PermissionFlagsBits } from "discord.js";

export interface RolePermissionPolicy {
  allow: bigint[];
  deny: bigint[];
}

export interface GlobalPermissionsConfig {
  policies: {
    everyone: RolePermissionPolicy;
    roomOwner: RolePermissionPolicy;
    staff?: RolePermissionPolicy;
  };
}

export const permissionsConfig: GlobalPermissionsConfig = {
  policies: {
    everyone: {
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.UseVAD,
        PermissionFlagsBits.Stream,
      ],
      deny: [],
    },
    roomOwner: {
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.MoveMembers,
        PermissionFlagsBits.ManageChannels,
      ],
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
  },
};
