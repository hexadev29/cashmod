import { OverwriteType, type OverwriteResolvable } from "discord.js";
import type { GlobalPermissionsConfig } from "../../../config/permissions/permissions.config.js";
import type { JtcPermissionsMapping } from "../../../config/jtc/jtc.config.js";

export interface JtcOverwriteOptions {
  guildId: string;
  ownerId: string;
  staffRoleId?: string;
}

export class PermissionService {
  constructor(
    private readonly permissionsConfig: GlobalPermissionsConfig,
    private readonly jtcMapping: JtcPermissionsMapping,
  ) {}

  /**
   * Builds Discord channel permission overwrites for a freshly created JTC room
   * using the centralized permission policies.
   */
  public buildJtcRoomOverwrites(
    options: JtcOverwriteOptions,
  ): OverwriteResolvable[] {
    const { guildId, ownerId, staffRoleId } = options;
    const everyonePolicy =
      this.permissionsConfig.policies[this.jtcMapping.everyonePolicyKey];
    const ownerPolicy =
      this.permissionsConfig.policies[this.jtcMapping.ownerPolicyKey];

    const overwrites: OverwriteResolvable[] = [
      // 1. @everyone role overwrite
      {
        id: guildId,
        type: OverwriteType.Role,
        allow: everyonePolicy.allow,
        deny: everyonePolicy.deny,
      },
      // 2. Room owner member overwrite
      {
        id: ownerId,
        type: OverwriteType.Member,
        allow: ownerPolicy.allow,
        deny: ownerPolicy.deny,
      },
    ];

    // 3. Optional staff role overwrite if configured
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
}
