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
  selectBestEmptyRoomToRecycle,
  type ExistingRoomInfo,
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
import { JtcOperationQueue, TaskPriority } from "./jtc-queue.js";
import type { ManagedRoomRecord, RoomAllocationResult } from "./jtc-types.js";
import { logger } from "../../diagnostics/logger.js";
import type { JtcCategoryName } from "../../../config/jtc/jtc.config.js";

export class JtcService {
  private readonly managedRooms = new Map<string, ManagedRoomRecord>();
  private readonly reservedChannelIds = new Set<string>();
  private readonly reservedChannelOwners = new Map<string, string>();
  private readonly asyncLock = new AsyncLock();
  private readonly cleanupHandler: RoomCleanupHandler;
  private readonly categoryManager: CategoryManager;
  private readonly queue: JtcOperationQueue;
  private readonly log = logger.child({ subsystem: "JtcService" });

  constructor(
    private readonly config: AppConfig,
    private readonly permissionService: PermissionService,
    cleanupHandler?: RoomCleanupHandler,
    categoryManager?: CategoryManager,
    queue?: JtcOperationQueue,
  ) {
    this.cleanupHandler =
      cleanupHandler ?? new RoomCleanupHandler(this.config.jtc.cleanup);
    this.categoryManager =
      categoryManager ?? new CategoryManager(this.config.jtc);
    this.queue =
      queue ?? new JtcOperationQueue(this.config.jtc.queue);
  }

  public getCategoryManager(): CategoryManager {
    return this.categoryManager;
  }

  public getQueue(): JtcOperationQueue {
    return this.queue;
  }

  public isManagedRoom(channelId: string): boolean {
    return this.managedRooms.has(channelId);
  }

  public getManagedRoom(channelId: string): ManagedRoomRecord | undefined {
    return this.managedRooms.get(channelId);
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

    // Resolve or dynamically create the category for this trigger on-demand
    let targetCategoryId: string;
    try {
      targetCategoryId = await this.categoryManager.getOrCreateCategory(
        member.guild,
        categoryName,
      );
    } catch (catErr: any) {
      this.log.error(
        `Aborting JTC room creation: CategoryManager failed to get or create category "${categoryName}": ${catErr?.message}`,
        undefined,
        catErr,
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
      const existingRooms: ExistingRoomInfo[] = [];

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
            const voiceCh = ch as VoiceChannel;
            existingRooms.push({
              id: ch.id,
              roomNumber: num,
              memberCount: voiceCh.members?.size ?? 0,
            });
          }
        }
      }

      // 1.5 Check if an empty managed room exists in this category to recycle
      if (this.config.jtc.queue?.enableEmptyRoomRecycling) {
        const bestEmpty = selectBestEmptyRoomToRecycle(
          existingRooms,
          this.reservedChannelIds,
        );
        if (bestEmpty) {
          const recycledChannel = allChannels.get(bestEmpty.id) as VoiceChannel;
          if (recycledChannel) {
            // Reserve room immediately so concurrent operations skip it
            this.reservedChannelIds.add(bestEmpty.id);
            this.reservedChannelOwners.set(bestEmpty.id, member.id);
            try {
              this.log.info(
                `Recycling empty room "${recycledChannel.name}" (#${bestEmpty.roomNumber}) for member "${member.user.tag}" (${member.id})`,
              );

              // Cancel any pending cleanup in both the cleanup handler and operation queue
              this.cleanupHandler.cancelPendingCleanup(bestEmpty.id);
              this.queue.cancelByTag(`cleanup:${bestEmpty.id}`);

              // Apply permission overwrites for the new owner
              const permissionOverwrites =
                this.permissionService.buildJtcRoomOverwrites({
                  guildId: guild.id,
                  ownerId: member.id,
                });

              try {
                if (
                  recycledChannel.permissionOverwrites &&
                  typeof (recycledChannel.permissionOverwrites as any).set ===
                    "function"
                ) {
                  await (recycledChannel.permissionOverwrites as any).set(
                    permissionOverwrites,
                  );
                }
              } catch (permErr: any) {
                this.log.warn(
                  `Failed to update permissions on recycled room: ${permErr?.message}`,
                );
              }

              // Move member to the recycled room
              try {
                await member.voice.setChannel(
                  recycledChannel,
                  "Cash Mod JTC move to recycled room",
                );
              } catch (moveErr: any) {
                this.log.warn(
                  `Failed to move member "${member.user.tag}" to recycled room "${recycledChannel.name}".`,
                  undefined,
                  moveErr,
                );
                return null;
              }

              // Update in-memory managed room state
              const record: ManagedRoomRecord = {
                channelId: recycledChannel.id,
                guildId: guild.id,
                ownerId: member.id,
                categoryName,
                roomNumber: bestEmpty.roomNumber,
                createdAt: new Date(),
              };
              this.managedRooms.set(recycledChannel.id, record);

              this.log.debug(
                `Successfully recycled and populated JTC room: "${recycledChannel.name}" (${recycledChannel.id})`,
              );

              return {
                channel: recycledChannel,
                roomNumber: bestEmpty.roomNumber,
                categoryName,
              };
            } finally {
              this.reservedChannelIds.delete(bestEmpty.id);
              this.reservedChannelOwners.delete(bestEmpty.id);
            }
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

      this.reservedChannelIds.add(newChannel.id);
      this.reservedChannelOwners.set(newChannel.id, member.id);
      try {
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
        this.reservedChannelIds.delete(newChannel.id);
        this.reservedChannelOwners.delete(newChannel.id);
      }
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

    const parentId = channel.parentId;
    const guild = channel.guild;

    const cleaned = await this.cleanupHandler.cleanupChannel(channel, (ch) =>
      this.isEligibleJtcChannel(ch),
    );
    if (cleaned) {
      this.managedRooms.delete(channel.id);

      // If the room was in a dynamic managed category, delete the category if no voice channels remain
      if (parentId && this.categoryManager.isManagedCategory(parentId)) {
        await this.categoryManager.deleteCategoryIfEmpty(guild, parentId);
      }
    }
    return cleaned;
  }

  /**
   * Reconciles dynamic categories and existing channels after bot startup.
   */
  public async reconcile(guild: Guild): Promise<ReconciliationResult> {
    await this.categoryManager.initFromState(guild);
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
    if (
      this.managedRooms.has(channel.id) ||
      this.reservedChannelIds.has(channel.id)
    ) {
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

  /**
   * Handles when a member directly joins a voice channel (e.g. clicking an existing room).
   * Adopts empty rooms awaiting cleanup, or detects overcapacity/reservation conflicts and relocates excess members.
   */
  public async handleDirectJoin(
    member: GuildMember,
    channel: VoiceChannel,
  ): Promise<void> {
    if (!this.isEligibleJtcChannel(channel)) {
      return;
    }

    // Ignore if member already left or moved away
    if (member.voice?.channelId && member.voice.channelId !== channel.id) {
      return;
    }

    let categoryName: JtcCategoryName | undefined =
      this.managedRooms.get(channel.id)?.categoryName;
    let roomNumber: number | undefined =
      this.managedRooms.get(channel.id)?.roomNumber;

    const match = this.config.jtc.namingRegex.exec(channel.name);
    if (match) {
      const matchedCatName = match[1];
      const catDef = Object.values(this.config.jtc.categories).find(
        (c) => c.name.toLowerCase() === matchedCatName.toLowerCase(),
      );
      if (catDef) {
        categoryName = catDef.name;
      }
      const parsedNum = parseInt(match[2], 10);
      if (!isNaN(parsedNum)) {
        roomNumber = parsedNum;
      }
    }

    if (!categoryName) {
      return;
    }

    const categoryDef = this.config.jtc.categories[categoryName];
    if (!categoryDef) {
      return;
    }

    const capacityLimit = categoryDef.userLimit;
    const isMemberInCache =
      typeof (channel.members as any)?.has === "function"
        ? (channel.members as any).has(member.id)
        : true;
    const currentMembers = isMemberInCache
      ? (channel.members?.size ?? 1)
      : (channel.members?.size ?? 0) + 1;

    const reservedFor = this.reservedChannelOwners.get(channel.id);
    const isReservedForOther =
      reservedFor !== undefined && reservedFor !== member.id;
    const isOverCapacity = currentMembers > capacityLimit;

    // Check if this member is the legitimate owner already
    const existingRecord = this.managedRooms.get(channel.id);
    const isExistingOwner = existingRecord?.ownerId === member.id;

    // Over-capacity or reservation conflict: relocate excess member
    if (isReservedForOther || (isOverCapacity && !isExistingOwner)) {
      this.log.info(
        `Overcapacity or reservation collision detected in room "${channel.name}" (${currentMembers}/${capacityLimit}) for member "${member.user.tag}" (${member.id}). Relocating member to separate ${categoryName} room.`,
      );

      const trigger = Object.values(this.config.jtc.triggers).find(
        (t) => t.categoryName.toLowerCase() === categoryName!.toLowerCase(),
      );

      if (!trigger) {
        this.log.error(
          `Cannot relocate member "${member.user.tag}": No trigger found for category "${categoryName}".`,
        );
        return;
      }

      await this.handleVoiceJoin(member, trigger.triggerChannelId);
      return;
    }

    // Room is within capacity
    // If room only has 1 occupant (this member), adopt them as the room owner
    if (currentMembers === 1) {
      this.cleanupHandler.cancelPendingCleanup(channel.id);
      this.queue.cancelByTag(`cleanup:${channel.id}`);

      const record: ManagedRoomRecord = {
        channelId: channel.id,
        guildId: channel.guild.id,
        ownerId: member.id,
        categoryName,
        roomNumber: roomNumber ?? 1,
        createdAt: new Date(),
      };
      this.managedRooms.set(channel.id, record);

      const permissionOverwrites =
        this.permissionService.buildJtcRoomOverwrites({
          guildId: channel.guild.id,
          ownerId: member.id,
        });

      try {
        if (
          channel.permissionOverwrites &&
          typeof (channel.permissionOverwrites as any).set === "function"
        ) {
          await (channel.permissionOverwrites as any).set(permissionOverwrites);
        }
      } catch (permErr: any) {
        this.log.warn(
          `Failed to update permissions on directly joined room "${channel.name}": ${permErr?.message}`,
        );
      }

      this.log.info(
        `Adopted directly joined room "${channel.name}" (#${roomNumber ?? 1}) for member "${member.user.tag}" (${member.id})`,
      );
    } else {
      // Room already has occupants within capacity (e.g. 2nd person in a Duo room)
      this.cleanupHandler.cancelPendingCleanup(channel.id);
      this.queue.cancelByTag(`cleanup:${channel.id}`);
    }
  }

  /**
   * Enqueues a member join event with HIGH priority in the operation queue.
   */
  public async queueVoiceJoin(
    member: GuildMember,
    joinedChannelId: string,
  ): Promise<RoomAllocationResult | null> {
    return this.queue.enqueue(
      () => this.handleVoiceJoin(member, joinedChannelId),
      TaskPriority.HIGH,
    );
  }

  /**
   * Enqueues a member direct join event with HIGH priority in the operation queue.
   */
  public async queueDirectJoin(
    member: GuildMember,
    channel: VoiceChannel,
  ): Promise<void> {
    return this.queue.enqueue(
      () => this.handleDirectJoin(member, channel),
      TaskPriority.HIGH,
    );
  }

  /**
   * Enqueues a member leave event with LOW priority in the operation queue.
   */
  public async queueVoiceLeave(
    channel: VoiceChannel,
  ): Promise<boolean> {
    return this.queue.enqueue(
      () => this.handleVoiceLeave(channel),
      TaskPriority.LOW,
      `cleanup:${channel.id}`,
    );
  }
}


