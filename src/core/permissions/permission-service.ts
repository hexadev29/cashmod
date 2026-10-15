import {
  OverwriteType,
  type Guild,
  type OverwriteResolvable,
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

export class PermissionService {
  constructor(
    private readonly permissionsConfig: GlobalPermissionsConfig,
    private readonly jtcMapping: JtcPermissionsMapping,
  ) {}

  /**
   * Builds Discord channel permission overwrites for a temporary JTC voice room.
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
   * Helper method matching buildTempPermissionOverwrites(guild, roles?)
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
}

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
