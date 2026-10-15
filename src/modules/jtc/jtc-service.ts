import {
  ChannelType,
  type Guild,
  type GuildMember,
  type VoiceChannel,
} from "discord.js";
import type { AppConfig } from "../../core/config/config-types.js";
import type { PermissionService } from "../../core/permissions/permission-service.js";
import {
  AsyncLock,
  extractUsedRoomNumbers,
  findFirstMissingPositiveNumber,
} from "./room-allocator.js";
import {
  calculateTargetPosition,
  type SiblingChannelInfo,
} from "./room-positioner.js";
import { RoomCleanupHandler } from "./room-cleanup.js";
import {
  reconcileJtcRooms,
  type ReconciliationResult,
} from "./jtc-reconciliation.js";
import { CategoryManager } from "./category-manager.js";
import type { ManagedRoomRecord, RoomAllocationResult } from "./jtc-types.js";
import { logger } from "../../diagnostics/logger.js";
import type { JtcCategoryName } from "../../../config/jtc/jtc.config.js";

export class JtcService {
  private readonly managedRooms = new Map<string, ManagedRoomRecord>();
  private readonly asyncLock = new AsyncLock();
  private readonly cleanupHandler: RoomCleanupHandler;
  private readonly categoryManager: CategoryManager;
  private readonly log = logger.child({ subsystem: "JtcService" });

  constructor(
    private readonly config: AppConfig,
    private readonly permissionService: PermissionService,
    cleanupHandler?: RoomCleanupHandler,
    categoryManager?: CategoryManager,
  ) {
    this.cleanupHandler =
      cleanupHandler ?? new RoomCleanupHandler(this.config.jtc.cleanup);
    this.categoryManager =
      categoryManager ?? new CategoryManager(this.config.jtc);
  }

  public getCategoryManager(): CategoryManager {
    return this.categoryManager;
  }

  public isManagedRoom(channelId: string): boolean {
    return this.managedRooms.has(channelId);
  }

  public registerAdoptedRoom(
    channelId: string,
    categoryName: JtcCategoryName,
    roomNumber: number,
  ): void {
    this.managedRooms.set(channelId, {
      channelId,
      guildId: this.config.discord.guildId,
      ownerId: "unknown",
      categoryName,
      roomNumber,
      createdAt: new Date(),
    });
  }

  /**
   * Handles when a member joins a voice channel.
   * If it is a configured trigger channel, creates a new JTC room in the dynamically managed category.
   */
  public async handleVoiceJoin(
    member: GuildMember,
    joinedChannelId: string,
  ): Promise<RoomAllocationResult | null> {
    const trigger = this.config.jtc.triggers[joinedChannelId];
    if (!trigger) {
      return null;
    }

    const { categoryName, roomNameTemplate, userLimit, bitrate } = trigger;
    const categoryDef = this.config.jtc.categories[categoryName];

    if (!categoryDef) {
      this.log.error(
        `Trigger channel ${joinedChannelId} points to unconfigured category definition: "${categoryName}".`,
      );
      return null;
    }

    // Ensure all 8 categories are dynamically initialized in Discord and persisted
    try {
      await this.categoryManager.ensureInitialized(member.guild);
    } catch (initErr: any) {
      this.log.error(
        `Aborting JTC room creation: CategoryManager failed to initialize categories: ${initErr?.message}`,
        undefined,
        initErr,
      );
      return null;
    }

    const targetCategoryId = this.categoryManager.getCategoryId(categoryName);
    if (!targetCategoryId) {
      this.log.error(
        `Category "${categoryName}" ID could not be resolved from CategoryManager.`,
      );
      return null;
    }

    // Acquire lock per category to prevent concurrent race conditions on number allocation
    const releaseLock = await this.asyncLock.acquire(
      `category:${targetCategoryId}`,
    );

    try {
      const guild = member.guild;

      // 1. Fetch current channels to inspect existing room numbers in this category
      const allChannels = await guild.channels.fetch();
      const siblings: SiblingChannelInfo[] = [];
      const siblingNames: string[] = [];

      for (const [, ch] of allChannels) {
        if (!ch || !ch.isVoiceBased() || ch.parentId !== targetCategoryId)
          continue;

        siblingNames.push(ch.name);
        const match = this.config.jtc.namingRegex.exec(ch.name);
        if (match && match[1]?.toLowerCase() === categoryName.toLowerCase()) {
          const num = parseInt(match[2], 10);
          if (!isNaN(num)) {
            siblings.push({
              id: ch.id,
              roomNumber: num,
              position: ch.position,
            });
          }
        }
      }

      // 2. Allocate the first missing positive room number
      const usedNumbers = extractUsedRoomNumbers(
        siblingNames,
        categoryName,
        this.config.jtc.namingRegex,
      );
      const allocatedNumber = findFirstMissingPositiveNumber(usedNumbers);
      const roomName = roomNameTemplate.replace(
        "{number}",
        String(allocatedNumber),
      );

      // 3. Compute target positioning
      const targetPosition = calculateTargetPosition(siblings, allocatedNumber);

      // 4. Derive permission overwrites
      const permissionOverwrites =
        this.permissionService.buildJtcRoomOverwrites({
          guildId: guild.id,
          ownerId: member.id,
        });

      this.log.info(
        `Creating JTC room "${roomName}" (#${allocatedNumber}) in dynamic category "${categoryName}" (${targetCategoryId}) for member "${member.user.tag}" (${member.id})`,
      );

      // 5. Create the channel in Discord
      let newChannel: VoiceChannel;
      try {
        newChannel = (await guild.channels.create({
          name: roomName,
          type: ChannelType.GuildVoice,
          parent: targetCategoryId,
          userLimit: userLimit ?? categoryDef.userLimit,
          bitrate,
          position: targetPosition,
          permissionOverwrites,
          reason: `Cash Mod JTC auto-creation for ${member.user.tag}`,
        })) as VoiceChannel;
      } catch (createErr: any) {
        this.log.error(
          `Failed to create Discord voice channel for "${roomName}": ${createErr?.message}`,
          undefined,
          createErr,
        );
        throw createErr;
      }

      // 6. Move the member to the created room
      try {
        await member.voice.setChannel(
          newChannel,
          "Cash Mod JTC move to created room",
        );
      } catch (moveErr: any) {
        // Failure compensation: clean up newly created channel if member could not be moved
        this.log.warn(
          `Failed to move member "${member.user.tag}" to newly created room "${newChannel.name}". Compensating by deleting room.`,
          undefined,
          moveErr,
        );
        try {
          await newChannel.delete("Cash Mod JTC move failure compensation");
        } catch (cleanupErr: any) {
          this.log.error(
            `Compensation channel deletion failed: ${cleanupErr?.message}`,
            undefined,
            cleanupErr,
          );
        }
        return null;
      }

      // 7. Store runtime state
      const record: ManagedRoomRecord = {
        channelId: newChannel.id,
        guildId: guild.id,
        ownerId: member.id,
        categoryName,
        roomNumber: allocatedNumber,
        createdAt: new Date(),
      };
      this.managedRooms.set(newChannel.id, record);

      this.log.debug(
        `Successfully created and populated JTC room: "${newChannel.name}" (${newChannel.id})`,
      );

      return {
        channel: newChannel,
        roomNumber: allocatedNumber,
        categoryName,
      };
    } finally {
      releaseLock();
    }
  }

  /**
   * Handles when a member leaves a voice channel.
   * If the channel is a managed JTC room and becomes empty, cleans it up safely.
   */
  public async handleVoiceLeave(channel: VoiceChannel): Promise<boolean> {
    const isManaged = this.isEligibleJtcChannel(channel);
    if (!isManaged) {
      return false;
    }

    const cleaned = await this.cleanupHandler.cleanupChannel(channel, (ch) =>
      this.isEligibleJtcChannel(ch),
    );
    if (cleaned) {
      this.managedRooms.delete(channel.id);
    }
    return cleaned;
  }

  /**
   * Reconciles dynamic categories and existing channels after bot startup.
   */
  public async reconcile(guild: Guild): Promise<ReconciliationResult> {
    await this.categoryManager.ensureInitialized(guild);
    return reconcileJtcRooms(
      guild,
      this.config.jtc,
      this.categoryManager,
      this.cleanupHandler,
      (chId, catName, num) => {
        this.registerAdoptedRoom(chId, catName, num);
      },
    );
  }

  /**
   * Determines if a channel is an eligible temporary JTC room.
   */
  public isEligibleJtcChannel(channel: VoiceChannel): boolean {
    if (this.managedRooms.has(channel.id)) {
      return true;
    }

    if (!channel.parentId) return false;

    // Check if channel parent is one of the dynamically managed categories
    if (
      this.categoryManager.isManagedCategory(channel.parentId) &&
      this.config.jtc.namingRegex.test(channel.name)
    ) {
      return true;
    }

    return false;
  }
}
