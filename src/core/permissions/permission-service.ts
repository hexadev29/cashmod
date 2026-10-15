import {
  OverwriteType,
  PermissionFlagsBits,
  type Guild,
  type OverwriteResolvable,
  type VoiceChannel,
} from "discord.js";
import {
  permissionsConfig as defaultPermissionsConfig,
  type GlobalPermissionsConfig,
} from "../../../config/permissions/permissions.config.js";
import {
  jtcConfig,
  type JtcPermissionsMapping,
} from "../../../config/jtc/jtc.config.js";

export interface JtcRoleIds {
  quarantine?: string;
  super_focus?: string;
  vc_restricted?: string;
}

export interface JtcOverwriteOptions {
  guildId: string;
  ownerId?: string;
  roles?: JtcRoleIds;
  staffRoleId?: string;
}

export interface PrivateJtcOverwriteOptions {
  guildId: string;
  ownerId: string;
  roles?: JtcRoleIds;
  trustedUserIds?: string[];
  blockedUserIds?: string[];
  locked?: boolean;
  hidden?: boolean;
  chatDisabled?: boolean;
}

export class PermissionService {
  constructor(
    private readonly permissionsConfig: GlobalPermissionsConfig,
    private readonly jtcMapping: JtcPermissionsMapping,
  ) {}

  /**
   * Builds Discord channel permission overwrites for a temporary public JTC voice room.
   * Public JTC rooms do NOT have an owner system for users.
   * Overwrites are configured for @everyone and restricted roles (quarantine, super_focus, vc_restricted).
   */
  public buildJtcRoomOverwrites(
    options: JtcOverwriteOptions,
  ): OverwriteResolvable[] {
    const { guildId, ownerId, roles, staffRoleId } = options;
    const everyonePolicyKey = this.jtcMapping.everyonePolicyKey ?? "everyone";
    const everyonePolicy = this.permissionsConfig.policies[everyonePolicyKey];

    const overwrites: OverwriteResolvable[] = [];

    // 1. @everyone role overwrite
    if (everyonePolicy) {
      overwrites.push({
        id: guildId,
        type: OverwriteType.Role,
        allow: everyonePolicy.allow,
        deny: everyonePolicy.deny,
      });
    }

    // 2. Restricted moderation roles (quarantine, super_focus, vc_restricted)
    const quarantineId =
      roles?.quarantine ?? this.permissionsConfig.roles?.quarantineRoleId;
    if (quarantineId && quarantineId.trim().length > 0) {
      const policy = this.permissionsConfig.policies.quarantine;
      if (policy) {
        overwrites.push({
          id: quarantineId,
          type: OverwriteType.Role,
          allow: policy.allow,
          deny: policy.deny,
        });
      }
    }

    const superFocusId =
      roles?.super_focus ?? this.permissionsConfig.roles?.superFocusRoleId;
    if (superFocusId && superFocusId.trim().length > 0) {
      const policy = this.permissionsConfig.policies.superFocus;
      if (policy) {
        overwrites.push({
          id: superFocusId,
          type: OverwriteType.Role,
          allow: policy.allow,
          deny: policy.deny,
        });
      }
    }

    const vcRestrictedId =
      roles?.vc_restricted ?? this.permissionsConfig.roles?.vcRestrictedRoleId;
    if (vcRestrictedId && vcRestrictedId.trim().length > 0) {
      const policy = this.permissionsConfig.policies.vcRestricted;
      if (policy) {
        overwrites.push({
          id: vcRestrictedId,
          type: OverwriteType.Role,
          allow: policy.allow,
          deny: policy.deny,
        });
      }
    }

    // 3. Public JTC has NO owner system for users.
    // Only if explicitly enabled via configuration and owner policy exists, apply owner overwrite.
    if (
      this.jtcMapping.enableOwnerPermissions &&
      ownerId &&
      this.jtcMapping.ownerPolicyKey &&
      this.permissionsConfig.policies[this.jtcMapping.ownerPolicyKey]
    ) {
      const ownerPolicy =
        this.permissionsConfig.policies[this.jtcMapping.ownerPolicyKey];
      if (ownerPolicy) {
        overwrites.push({
          id: ownerId,
          type: OverwriteType.Member,
          allow: ownerPolicy.allow,
          deny: ownerPolicy.deny,
        });
      }
    }

    // 4. Optional staff role overwrite if configured
    if (staffRoleId && this.permissionsConfig.policies.staff) {
      const staffPolicy = this.permissionsConfig.policies.staff;
      overwrites.push({
        id: staffRoleId,
        type: OverwriteType.Role,
        allow: staffPolicy.allow,
        deny: staffPolicy.deny,
      });
    }

    return overwrites;
  }

  /**
   * Helper method matching buildTempPermissionOverwrites(guild, roles?) for public JTC
   */
  public buildTempPermissionOverwrites(
    guild:
      | Guild
      | { id: string; roles?: { everyone?: { id?: string } | string } }
      | string,
    roles?: JtcRoleIds,
  ): OverwriteResolvable[] {
    const guildId = typeof guild === "string" ? guild : guild.id;
    return this.buildJtcRoomOverwrites({ guildId, roles });
  }

  /**
   * Builds Discord channel permission overwrites for a Private JTC room.
   * Includes owner permissions for ownerId and private JTC @everyone policy.
   */
  public buildPrivateJtcRoomOverwrites(
    options: PrivateJtcOverwriteOptions,
  ): OverwriteResolvable[] {
    const {
      guildId,
      ownerId,
      roles,
      trustedUserIds,
      blockedUserIds,
      locked,
      hidden,
      chatDisabled,
    } = options;
    const everyonePolicy =
      this.permissionsConfig.policies.privateEveryone ??
      this.permissionsConfig.policies.everyone;
    const ownerPolicy =
      this.permissionsConfig.policies.privateOwner ?? {
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.SendMessages,
        ],
        deny: [],
      };

    const overwrites: OverwriteResolvable[] = [];

    // 1. @everyone role overwrite (adjusted for lock/hide/chatDisabled)
    const everyoneAllow = new Set(everyonePolicy.allow);
    const everyoneDeny = new Set(everyonePolicy.deny);

    if (locked) {
      everyoneAllow.delete(PermissionFlagsBits.Connect);
      everyoneDeny.add(PermissionFlagsBits.Connect);
    }
    if (hidden) {
      everyoneAllow.delete(PermissionFlagsBits.ViewChannel);
      everyoneDeny.add(PermissionFlagsBits.ViewChannel);
    }
    if (chatDisabled) {
      everyoneAllow.delete(PermissionFlagsBits.SendMessages);
      everyoneDeny.add(PermissionFlagsBits.SendMessages);
    }

    overwrites.push({
      id: guildId,
      type: OverwriteType.Role,
      allow: Array.from(everyoneAllow),
      deny: Array.from(everyoneDeny),
    });

    // 2. Restricted moderation roles (quarantine, super_focus, vc_restricted)
    const quarantineId =
      roles?.quarantine ?? this.permissionsConfig.roles?.quarantineRoleId;
    if (quarantineId && quarantineId.trim().length > 0) {
      const policy = this.permissionsConfig.policies.quarantine;
      if (policy) {
        overwrites.push({
          id: quarantineId,
          type: OverwriteType.Role,
          allow: policy.allow,
          deny: policy.deny,
        });
      }
    }

    const superFocusId =
      roles?.super_focus ?? this.permissionsConfig.roles?.superFocusRoleId;
    if (superFocusId && superFocusId.trim().length > 0) {
      const policy = this.permissionsConfig.policies.superFocus;
      if (policy) {
        overwrites.push({
          id: superFocusId,
          type: OverwriteType.Role,
          allow: policy.allow,
          deny: policy.deny,
        });
      }
    }

    const vcRestrictedId =
      roles?.vc_restricted ?? this.permissionsConfig.roles?.vcRestrictedRoleId;
    if (vcRestrictedId && vcRestrictedId.trim().length > 0) {
      const policy = this.permissionsConfig.policies.vcRestricted;
      if (policy) {
        overwrites.push({
          id: vcRestrictedId,
          type: OverwriteType.Role,
          allow: policy.allow,
          deny: policy.deny,
        });
      }
    }

    // 3. Owner member overwrite
    overwrites.push({
      id: ownerId,
      type: OverwriteType.Member,
      allow: ownerPolicy.allow,
      deny: ownerPolicy.deny,
    });

    // 4. Trusted users member overwrites (excluding blocked users & owner)
    if (trustedUserIds && trustedUserIds.length > 0) {
      for (const trustedId of trustedUserIds) {
        if (
          trustedId &&
          trustedId !== ownerId &&
          !blockedUserIds?.includes(trustedId)
        ) {
          overwrites.push({
            id: trustedId,
            type: OverwriteType.Member,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.SendMessages,
            ],
            deny: [],
          });
        }
      }
    }

    // 5. Blocked users member overwrites (deny Connect; takes precedence over @everyone allow)
    if (blockedUserIds && blockedUserIds.length > 0) {
      for (const blockedId of blockedUserIds) {
        if (blockedId && blockedId !== ownerId) {
          overwrites.push({
            id: blockedId,
            type: OverwriteType.Member,
            allow: [],
            deny: [PermissionFlagsBits.Connect],
          });
        }
      }
    }

    return overwrites;
  }

  /**
   * Dynamically toggles owner permissions on a private voice channel.
   */
  public async setOwnerPermissions(
    channel: VoiceChannel,
    userId: string,
    enabled: boolean,
  ): Promise<void> {
    return setOwnerPermissions(channel, userId, enabled);
  }
}

/**
 * Dynamically toggles owner permissions on a voice channel for a given user.
 */
export const setOwnerPermissions = async (
  channel: VoiceChannel,
  userId: string,
  enabled: boolean,
): Promise<void> => {
  const overwrite = channel.permissionOverwrites.cache.get(userId);
  const allow = new Set(overwrite?.allow?.toArray() || []);
  const deny = new Set(overwrite?.deny?.toArray() || []);

  const ownerPerms = [
    "ViewChannel",
    "Connect",
    "SendMessages",
  ] as const;

  for (const perm of ownerPerms) {
    deny.delete(perm);
    if (enabled) {
      allow.add(perm);
    } else {
      allow.delete(perm);
    }
  }

  await channel.permissionOverwrites.edit(userId, {
    ViewChannel: allow.has("ViewChannel"),
    Connect: allow.has("Connect"),
    SendMessages: allow.has("SendMessages"),
  });
};

/**
 * Standalone helper function buildTempPermissionOverwrites(guild, roles?)
 */
export const buildTempPermissionOverwrites = (
  guild:
    | Guild
    | { id: string; roles?: { everyone?: { id?: string } | string } }
    | string,
  roles?: JtcRoleIds,
  customPermissionsConfig: GlobalPermissionsConfig = defaultPermissionsConfig,
  customJtcMapping: JtcPermissionsMapping = jtcConfig.permissions,
): OverwriteResolvable[] => {
  const service = new PermissionService(
    customPermissionsConfig,
    customJtcMapping,
  );
  return service.buildTempPermissionOverwrites(guild, roles);
};
