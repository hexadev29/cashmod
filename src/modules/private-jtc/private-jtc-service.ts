import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type VoiceChannel,
} from "discord.js";
import type { AppConfig } from "../../core/config/config-types.js";
import type { PermissionService } from "../../core/permissions/permission-service.js";
import { AsyncLock } from "../jtc/room-allocator.js";
import { JtcOperationQueue, TaskPriority } from "../jtc/jtc-queue.js";
import { PrivateCategoryManager } from "./private-category-manager.js";
import { PrivateJtcStateStore } from "./private-jtc-state-store.js";
import { buildPrivateInterfaceMessage } from "./private-interface-builder.js";
import type { PrivateJtcRoomRecord } from "./private-jtc-types.js";
import { logger } from "../../diagnostics/logger.js";

export interface PrivateReconciliationResult {
  totalScanned: number;
  retained: number;
  deleted: number;
}

export class PrivateJtcService {
  private readonly managedRooms = new Map<string, PrivateJtcRoomRecord>();
  private readonly transferTimers = new Map<string, NodeJS.Timeout>();
  private readonly asyncLock = new AsyncLock();
  private readonly stateStore: PrivateJtcStateStore;
  private readonly categoryManager: PrivateCategoryManager;
  private readonly queue: JtcOperationQueue;
  private readonly log = logger.child({ subsystem: "PrivateJtcService" });

  constructor(
    private readonly config: AppConfig,
    private readonly permissionService: PermissionService,
    stateStore?: PrivateJtcStateStore,
    categoryManager?: PrivateCategoryManager,
    queue?: JtcOperationQueue,
  ) {
    this.stateStore =
      stateStore ??
      new PrivateJtcStateStore(this.config.privateJtc.stateFilePath);
    this.categoryManager =
      categoryManager ??
      new PrivateCategoryManager(this.config.privateJtc, this.stateStore);
    this.queue =
      queue ?? new JtcOperationQueue(this.config.jtc.queue);
  }

  public getStateStore(): PrivateJtcStateStore {
    return this.stateStore;
  }

  public getCategoryManager(): PrivateCategoryManager {
    return this.categoryManager;
  }

  public getQueue(): JtcOperationQueue {
    return this.queue;
  }

  public isManagedRoom(channelId: string): boolean {
    return this.managedRooms.has(channelId);
  }

  public getManagedRoom(channelId: string): PrivateJtcRoomRecord | undefined {
    return this.managedRooms.get(channelId);
  }

  public isEligiblePrivateChannel(channel: VoiceChannel): boolean {
    if (this.managedRooms.has(channel.id)) {
      return true;
    }
    const catId = this.categoryManager.getCategoryId();
    return Boolean(catId && channel.parentId === catId);
  }

  /**
   * Clears any running transfer timers. Useful for shutdown and testing.
   */
  public clearAllTimers(): void {
    for (const [channelId, timer] of this.transferTimers.entries()) {
      clearTimeout(timer);
      this.log.debug(`Cleared ownership transfer timer for channel ${channelId}`);
    }
    this.transferTimers.clear();
  }

  /**
   * Persists active rooms to state storage.
   * Per user requirement: Any changes made under transferred ownership
   * are NOT stored in the database / data folder.
   */
  private async saveCurrentState(guildId: string): Promise<void> {
    const rooms: Record<string, PrivateJtcRoomRecord> = {};
    for (const [id, rec] of this.managedRooms.entries()) {
      if (rec.isTransferred) {
        // Filter out changes made under transferred ownership from persistent storage
        rooms[id] = {
          channelId: rec.channelId,
          guildId: rec.guildId,
          categoryId: rec.categoryId,
          ownerId: rec.originalOwnerId, // preserve original creator baseline
          originalOwnerId: rec.originalOwnerId,
          isTransferred: true,
          createdAt: rec.createdAt,
          joinHistory: rec.joinHistory,
          trustedUserIds: [], // do not persist transferred owner's trusted list
          settings: {},       // do not persist transferred owner's settings
        };
      } else {
        rooms[id] = rec;
      }
    }

    await this.stateStore.saveState(
      guildId,
      this.config.privateJtc.anchorCategoryId,
      {
        categoryId: this.categoryManager.getCategoryId() ?? undefined,
        rooms,
      },
    );
  }

  /**
   * Startup reconciliation: restores state from disk, scans guild channels,
   * cleans up dangling/empty channels, and restores memory records.
   */
  public async reconcile(guild: Guild): Promise<PrivateReconciliationResult> {
    const release = await this.asyncLock.acquire("private-reconcile");
    try {
      this.log.info(
        `Starting Private JTC startup reconciliation for guild "${guild.name}" (${guild.id})...`,
      );

      await this.categoryManager.initFromState(guild);

      const loadedState = await this.stateStore.loadState(
        guild.id,
        this.config.privateJtc.anchorCategoryId,
      );

      let totalScanned = 0;
      let retained = 0;
      let deleted = 0;

      if (loadedState && loadedState.rooms) {
        for (const [channelId, record] of Object.entries(loadedState.rooms)) {
          totalScanned++;
          const channel = (await guild.channels
            .fetch(channelId)
            .catch(() => null)) as VoiceChannel | null;

          if (!channel || channel.type !== ChannelType.GuildVoice) {
            this.log.info(
              `Pruning private room ${channelId} from state as channel no longer exists in Discord.`,
            );
            deleted++;
            continue;
          }

          if (channel.members.size === 0) {
            this.log.info(
              `Cleaning up empty private room "${channel.name}" (${channelId}) found during startup reconciliation.`,
            );
            try {
              await channel.delete("Private JTC startup reconciliation: empty room");
            } catch (delErr: any) {
              this.log.warn(
                `Failed to delete empty private room ${channelId}: ${delErr?.message}`,
              );
            }
            deleted++;
            continue;
          }

          // Ensure trustedUserIds and settings are initialized
          record.trustedUserIds = record.trustedUserIds ?? [];
          record.settings = record.settings ?? {};
          record.originalOwnerId = record.originalOwnerId ?? record.ownerId;
          record.isTransferred = record.isTransferred ?? false;

          // Room exists and has occupants
          this.managedRooms.set(channelId, record);
          retained++;

          // Check if owner is still in the room, if not, handle transfer
          if (!channel.members.has(record.ownerId)) {
            this.log.info(
              `Owner ${record.ownerId} of room "${channel.name}" is not present upon startup; evaluating ownership transfer.`,
            );
            await this.evaluateOwnershipTransfer(channel, record);
          }
        }
      }

      await this.saveCurrentState(guild.id);
      await this.categoryManager.deleteCategoryIfEmpty(guild);

      this.log.info(
        `Private JTC reconciliation completed: ${totalScanned} scanned, ${retained} retained, ${deleted} deleted.`,
      );

      return { totalScanned, retained, deleted };
    } finally {
      release();
    }
  }

  /**
   * Handles when a member joins the private trigger voice channel.
   * Creates a dedicated private room, sets owner permissions, moves member, sends control interface, and persists state.
   */
  public async handleVoiceJoin(
    member: GuildMember,
    triggerChannelId: string,
  ): Promise<PrivateJtcRoomRecord | null> {
    if (triggerChannelId !== this.config.privateJtc.triggerChannelId) {
      return null;
    }

    const release = await this.asyncLock.acquire("private-voice-join");
    try {
      this.log.info(
        `Private JTC trigger join by member "${member.user.tag}" (${member.id})`,
      );

      const targetCategoryId =
        await this.categoryManager.getOrCreateCategory(member.guild);

      const roomName = this.config.privateJtc.roomNameTemplate.replace(
        "{username}",
        member.user.username,
      );

      const permissionOverwrites =
        this.permissionService.buildPrivateJtcRoomOverwrites({
          guildId: member.guild.id,
          ownerId: member.id,
        });

      this.log.info(
        `Creating private room "${roomName}" in dynamic category (${targetCategoryId}) for owner "${member.user.tag}" (${member.id})`,
      );

      const newChannel = (await member.guild.channels.create({
        name: roomName,
        type: ChannelType.GuildVoice,
        parent: targetCategoryId,
        permissionOverwrites,
        reason: `Cash Mod Private JTC creation for ${member.user.tag} (${member.id})`,
      })) as VoiceChannel;

      // Move member into the newly created room
      try {
        await member.voice.setChannel(
          newChannel,
          "Moved to newly created Private JTC voice room",
        );
        this.log.debug(
          `Moved member "${member.user.tag}" (${member.id}) into private room "${newChannel.name}" (${newChannel.id})`,
        );
      } catch (moveErr: any) {
        this.log.warn(
          `Failed to move member "${member.user.tag}" into private room ${newChannel.id}: ${moveErr?.message}`,
        );
      }

      const now = new Date().toISOString();
      const record: PrivateJtcRoomRecord = {
        channelId: newChannel.id,
        guildId: member.guild.id,
        categoryId: targetCategoryId,
        ownerId: member.id,
        originalOwnerId: member.id,
        isTransferred: false,
        createdAt: now,
        joinHistory: [
          {
            userId: member.id,
            joinedAt: now,
          },
        ],
        trustedUserIds: [],
        settings: {},
      };

      // Post the interactive control interface embed with 12 emoji buttons
      if (typeof (newChannel as any).send === "function") {
        try {
          const interfacePayload = buildPrivateInterfaceMessage(
            this.config.privateJtc,
          );
          const interfaceMsg = await (newChannel as any).send(interfacePayload);
          record.interfaceMessageId = interfaceMsg?.id;
        } catch (msgErr: any) {
          this.log.warn(
            `Failed to send private interface message to ${newChannel.id}: ${msgErr?.message}`,
          );
        }
      }

      this.managedRooms.set(newChannel.id, record);
      await this.saveCurrentState(member.guild.id);

      return record;
    } catch (err: any) {
      this.log.error(
        `Failed to handle private voice join for member "${member.user.tag}" (${member.id}): ${err?.message}`,
        undefined,
        err,
      );
      return null;
    } finally {
      release();
    }
  }

  /**
   * Handles when a member directly joins an existing private room.
   * Tracks join history and order.
   */
  public async handleMemberJoin(
    member: GuildMember,
    channel: VoiceChannel,
  ): Promise<void> {
    const record = this.managedRooms.get(channel.id);
    if (!record) {
      return;
    }

    // Cancel any pending cleanup for this channel
    this.queue.cancelByTag(`private-leave:${channel.id}`);

    const existingPresence = record.joinHistory.find(
      (h) => h.userId === member.id,
    );

    if (!existingPresence) {
      record.joinHistory.push({
        userId: member.id,
        joinedAt: new Date().toISOString(),
      });
      this.log.info(
        `Recorded member "${member.user.tag}" (${member.id}) join history in private room "${channel.name}" (${channel.id})`,
      );
      await this.saveCurrentState(channel.guild.id);
    }
  }

  /**
   * Handles when a member leaves a private room.
   * Manages empty room deletion, owner leaving, and 15-minute ownership transfer.
   */
  public async handleVoiceLeave(
    channel: VoiceChannel,
    leavingMember?: GuildMember,
  ): Promise<void> {
    const release = await this.asyncLock.acquire(
      `private-leave-lock:${channel.id}`,
    );
    try {
      const record = this.managedRooms.get(channel.id);
      if (!record) {
        return;
      }

      // Check remaining members excluding leaving member
      const remainingMembers = channel.members.filter(
        (m) => !leavingMember || m.id !== leavingMember.id,
      );

      if (remainingMembers.size === 0) {
        this.log.info(
          `Private room "${channel.name}" (${channel.id}) is now empty; deleting room.`,
        );

        // Cancel any pending transfer timer
        const timer = this.transferTimers.get(channel.id);
        if (timer) {
          clearTimeout(timer);
          this.transferTimers.delete(channel.id);
        }

        try {
          await channel.delete("Private JTC room empty cleanup");
        } catch (delErr: any) {
          this.log.warn(
            `Failed to delete empty private room ${channel.id}: ${delErr?.message}`,
          );
        }

        this.managedRooms.delete(channel.id);
        await this.saveCurrentState(channel.guild.id);
        await this.categoryManager.deleteCategoryIfEmpty(channel.guild);
        return;
      }

      // Channel is not empty.
      if (leavingMember) {
        // Remove leaving member from presence history
        record.joinHistory = record.joinHistory.filter(
          (h) => h.userId !== leavingMember.id,
        );
      }

      // Check if current owner is still present
      const isOwnerPresent = remainingMembers.has(record.ownerId);

      if (!isOwnerPresent) {
        this.log.info(
          `Owner ${record.ownerId} is no longer in private room "${channel.name}" (${channel.id}). Evaluating ownership transfer.`,
        );
        await this.evaluateOwnershipTransfer(channel, record, remainingMembers);
      }

      await this.saveCurrentState(channel.guild.id);
    } finally {
      release();
    }
  }

  /**
   * Evaluates the next occupant in join order and either transfers ownership immediately
   * (if elapsed >= ownershipTransferDelayMs) or schedules a timer for the remaining duration.
   */
  private async evaluateOwnershipTransfer(
    channel: VoiceChannel,
    record: PrivateJtcRoomRecord,
    presentMembers = channel.members,
  ): Promise<void> {
    // Clear any existing transfer timer
    const existingTimer = this.transferTimers.get(channel.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.transferTimers.delete(channel.id);
    }

    // Filter join history for users currently present in the room
    const candidates = record.joinHistory.filter((h) =>
      presentMembers.has(h.userId),
    );

    if (candidates.length === 0) {
      this.log.warn(
        `No eligible candidate in join history found for private room "${channel.name}" (${channel.id}).`,
      );
      return;
    }

    const nextCandidate = candidates[0];
    const joinedAtMs = new Date(nextCandidate.joinedAt).getTime();
    const elapsedMs = Math.max(0, Date.now() - joinedAtMs);
    const delayMs = this.config.privateJtc.ownershipTransferDelayMs;
    const remainingMs = delayMs - elapsedMs;

    if (remainingMs <= 0) {
      // User has been in the VC >= 15 minutes! Transfer immediately.
      this.log.info(
        `Candidate "${nextCandidate.userId}" has been in private room "${channel.name}" for ${Math.round(elapsedMs / 1000)}s (>= ${Math.round(delayMs / 1000)}s). Transferring ownership immediately.`,
      );
      await this.transferOwnership(channel, nextCandidate.userId);
    } else {
      // User has not reached 15 minutes yet. Schedule timer.
      this.log.info(
        `Candidate "${nextCandidate.userId}" has been in private room "${channel.name}" for ${Math.round(elapsedMs / 1000)}s. Scheduling ownership transfer in ${Math.round(remainingMs / 1000)}s.`,
      );

      const timer = setTimeout(async () => {
        this.transferTimers.delete(channel.id);
        await this.handleScheduledTransferExecution(channel, nextCandidate.userId);
      }, remainingMs);

      this.transferTimers.set(channel.id, timer);
    }
  }

  /**
   * Public execution of scheduled transfer with channel reference.
   */
  public async handleScheduledTransferExecution(
    channel: VoiceChannel,
    candidateUserId: string,
  ): Promise<void> {
    const record = this.managedRooms.get(channel.id);
    if (!record) {
      return;
    }

    if (channel.members.size === 0) {
      await this.handleVoiceLeave(channel);
      return;
    }

    if (channel.members.has(candidateUserId)) {
      this.log.info(
        `Scheduled transfer executing: Candidate "${candidateUserId}" is present in private room "${channel.name}". Transferring ownership.`,
      );
      await this.transferOwnership(channel, candidateUserId);
    } else {
      this.log.info(
        `Scheduled transfer skipped for candidate "${candidateUserId}" (no longer in room); re-evaluating remaining members.`,
      );
      await this.evaluateOwnershipTransfer(channel, record);
    }
  }

  /**
   * Transfers ownership of a private room to a new owner:
   * 1. Revokes old owner permissions.
   * 2. Grants new owner permissions.
   * 3. Renames channel to `{username}'s Room`.
   * 4. Updates state store.
   */
  public async transferOwnership(
    channel: VoiceChannel,
    newOwnerId: string,
  ): Promise<boolean> {
    const record = this.managedRooms.get(channel.id);
    if (!record) {
      return false;
    }

    const oldOwnerId = record.ownerId;
    record.ownerId = newOwnerId;
    record.isTransferred = true;

    // 1. Revoke old owner permissions
    if (oldOwnerId && oldOwnerId !== newOwnerId) {
      try {
        await this.permissionService.setOwnerPermissions(
          channel,
          oldOwnerId,
          false,
        );
        this.log.debug(
          `Revoked owner permissions for old owner "${oldOwnerId}" in room "${channel.name}"`,
        );
      } catch (err: any) {
        this.log.warn(
          `Failed to revoke owner permissions for old owner "${oldOwnerId}": ${err?.message}`,
        );
      }
    }

    // 2. Grant new owner permissions
    try {
      await this.permissionService.setOwnerPermissions(
        channel,
        newOwnerId,
        true,
      );
      this.log.debug(
        `Granted owner permissions for new owner "${newOwnerId}" in room "${channel.name}"`,
      );
    } catch (err: any) {
      this.log.warn(
        `Failed to grant owner permissions for new owner "${newOwnerId}": ${err?.message}`,
      );
    }

    // 3. Rename channel
    try {
      const newOwnerMember = await channel.guild.members
        .fetch(newOwnerId)
        .catch(() => null);
      const username =
        newOwnerMember?.user?.username ??
        newOwnerMember?.displayName ??
        "Member";
      const newName = this.config.privateJtc.roomNameTemplate.replace(
        "{username}",
        username,
      );

      if (channel.name !== newName) {
        await channel.setName(newName, "Private JTC ownership transfer");
        this.log.info(
          `Renamed private room from "${channel.name}" to "${newName}" for new owner "${username}" (${newOwnerId})`,
        );
      }
    } catch (renameErr: any) {
      this.log.warn(
        `Failed to rename private room ${channel.id} during ownership transfer: ${renameErr?.message}`,
      );
    }

    // 4. Update persistent state (filtered per transferred ownership rule)
    await this.saveCurrentState(channel.guild.id);

    return true;
  }

  // ==========================================
  // ROOM OWNER CONTROL OPERATIONS
  // ==========================================

  /**
   * Renames the private voice channel.
   */
  public async renameRoom(
    channel: VoiceChannel,
    newName: string,
    operatorId: string,
  ): Promise<boolean> {
    const record = this.managedRooms.get(channel.id);
    if (!record || record.ownerId !== operatorId) {
      return false;
    }

    const trimmed = newName.trim().slice(0, 100);
    if (trimmed.length === 0) return false;

    await channel.setName(trimmed, "Private JTC owner rename");
    record.settings = { ...record.settings, userLimit: record.settings?.userLimit };
    await this.saveCurrentState(channel.guild.id);
    this.log.info(`Owner ${operatorId} renamed private room ${channel.id} to "${trimmed}"`);
    return true;
  }

  /**
   * Sets the user limit on the private voice channel (0 = unlimited).
   */
  public async setRoomLimit(
    channel: VoiceChannel,
    limit: number,
    operatorId: string,
  ): Promise<boolean> {
    const record = this.managedRooms.get(channel.id);
    if (!record || record.ownerId !== operatorId) {
      return false;
    }

    const clamped = Math.max(0, Math.min(99, limit));
    await channel.setUserLimit(clamped, "Private JTC owner user limit");
    record.settings = { ...record.settings, userLimit: clamped };
    await this.saveCurrentState(channel.guild.id);
    this.log.info(`Owner ${operatorId} set private room ${channel.id} user limit to ${clamped}`);
    return true;
  }

  /**
   * Locks the private voice channel for @everyone while keeping trusted users connected.
   */
  public async lockRoom(
    channel: VoiceChannel,
    operatorId: string,
  ): Promise<boolean> {
    const record = this.managedRooms.get(channel.id);
    if (!record || record.ownerId !== operatorId) {
      return false;
    }

    await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
      Connect: false,
    });

    // Ensure all trusted users have explicit Connect: true
    for (const trustedId of record.trustedUserIds) {
      await channel.permissionOverwrites.edit(trustedId, {
        Connect: true,
        ViewChannel: true,
      });
    }

    record.settings = { ...record.settings, locked: true };
    await this.saveCurrentState(channel.guild.id);
    this.log.info(`Owner ${operatorId} locked private room ${channel.id}`);
    return true;
  }

  /**
   * Unlocks the private voice channel for @everyone.
   */
  public async unlockRoom(
    channel: VoiceChannel,
    operatorId: string,
  ): Promise<boolean> {
    const record = this.managedRooms.get(channel.id);
    if (!record || record.ownerId !== operatorId) {
      return false;
    }

    await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
      Connect: null,
    });

    record.settings = { ...record.settings, locked: false };
    await this.saveCurrentState(channel.guild.id);
    this.log.info(`Owner ${operatorId} unlocked private room ${channel.id}`);
    return true;
  }

  /**
   * Hides the private voice channel for @everyone.
   */
  public async hideRoom(
    channel: VoiceChannel,
    operatorId: string,
  ): Promise<boolean> {
    const record = this.managedRooms.get(channel.id);
    if (!record || record.ownerId !== operatorId) {
      return false;
    }

    await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
      ViewChannel: false,
    });

    // Ensure owner and trusted users have explicit ViewChannel: true
    await channel.permissionOverwrites.edit(record.ownerId, {
      ViewChannel: true,
      Connect: true,
      SendMessages: true,
    });

    for (const trustedId of record.trustedUserIds) {
      await channel.permissionOverwrites.edit(trustedId, {
        ViewChannel: true,
        Connect: true,
      });
    }

    record.settings = { ...record.settings, hidden: true };
    await this.saveCurrentState(channel.guild.id);
    this.log.info(`Owner ${operatorId} hid private room ${channel.id}`);
    return true;
  }

  /**
   * Unhides the private voice channel for @everyone.
   */
  public async unhideRoom(
    channel: VoiceChannel,
    operatorId: string,
  ): Promise<boolean> {
    const record = this.managedRooms.get(channel.id);
    if (!record || record.ownerId !== operatorId) {
      return false;
    }

    await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
      ViewChannel: null,
    });

    record.settings = { ...record.settings, hidden: false };
    await this.saveCurrentState(channel.guild.id);
    this.log.info(`Owner ${operatorId} unhid private room ${channel.id}`);
    return true;
  }

  /**
   * Toggles voice chat text messages for @everyone.
   * Returns true if chat is now disabled, false if enabled.
   */
  public async toggleChat(
    channel: VoiceChannel,
    operatorId: string,
  ): Promise<boolean | null> {
    const record = this.managedRooms.get(channel.id);
    if (!record || record.ownerId !== operatorId) {
      return null;
    }

    const everyoneOverwrite = channel.permissionOverwrites.cache.get(
      channel.guild.roles.everyone.id,
    );
    const isCurrentlyDenied =
      everyoneOverwrite?.deny?.has(PermissionFlagsBits.SendMessages) ?? false;
    const newChatDisabled = !isCurrentlyDenied;

    await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
      SendMessages: newChatDisabled ? false : null,
    });

    record.settings = { ...record.settings, chatDisabled: newChatDisabled };
    await this.saveCurrentState(channel.guild.id);
    this.log.info(
      `Owner ${operatorId} toggled text chat for private room ${channel.id} to disabled=${newChatDisabled}`,
    );
    return newChatDisabled;
  }

  /**
   * Grants trust to one or more users.
   */
  public async trustUsers(
    channel: VoiceChannel,
    userIds: string[],
    operatorId: string,
  ): Promise<string[]> {
    const record = this.managedRooms.get(channel.id);
    if (!record || record.ownerId !== operatorId) {
      return [];
    }

    record.trustedUserIds = record.trustedUserIds ?? [];
    const added: string[] = [];

    for (const uid of userIds) {
      if (uid === operatorId || record.trustedUserIds.includes(uid)) {
        continue;
      }
      record.trustedUserIds.push(uid);
      added.push(uid);

      await channel.permissionOverwrites.edit(uid, {
        ViewChannel: true,
        Connect: true,
      });
    }

    if (added.length > 0) {
      await this.saveCurrentState(channel.guild.id);
      this.log.info(
        `Owner ${operatorId} trusted ${added.length} user(s) in room ${channel.id}: ${added.join(", ")}`,
      );
    }

    return added;
  }

  /**
   * Revokes trust from one or more users.
   */
  public async untrustUsers(
    channel: VoiceChannel,
    userIds: string[],
    operatorId: string,
  ): Promise<string[]> {
    const record = this.managedRooms.get(channel.id);
    if (!record || record.ownerId !== operatorId) {
      return [];
    }

    record.trustedUserIds = record.trustedUserIds ?? [];
    const removed: string[] = [];

    for (const uid of userIds) {
      if (!record.trustedUserIds.includes(uid)) {
        continue;
      }
      record.trustedUserIds = record.trustedUserIds.filter((id) => id !== uid);
      removed.push(uid);

      if (uid !== record.ownerId) {
        await channel.permissionOverwrites.delete(uid).catch(() => {});
      }
    }

    if (removed.length > 0) {
      await this.saveCurrentState(channel.guild.id);
      this.log.info(
        `Owner ${operatorId} untrusted ${removed.length} user(s) in room ${channel.id}: ${removed.join(", ")}`,
      );
    }

    return removed;
  }

  /**
   * Disconnects a non-owner member from the private voice channel.
   */
  public async kickMember(
    channel: VoiceChannel,
    targetUserId: string,
    operatorId: string,
  ): Promise<boolean> {
    const record = this.managedRooms.get(channel.id);
    if (!record || record.ownerId !== operatorId || targetUserId === operatorId) {
      return false;
    }

    const member = channel.members.get(targetUserId);
    if (!member || !member.voice) {
      return false;
    }

    try {
      await member.voice.disconnect("Kicked by private room owner");
      this.log.info(
        `Owner ${operatorId} kicked member ${targetUserId} from private room ${channel.id}`,
      );
      return true;
    } catch (kickErr: any) {
      this.log.warn(
        `Failed to kick member ${targetUserId} from room ${channel.id}: ${kickErr?.message}`,
      );
      return false;
    }
  }

  /**
   * Enqueues a member join event with HIGH priority in the operation queue.
   */
  public async queueVoiceJoin(
    member: GuildMember,
    triggerChannelId: string,
  ): Promise<PrivateJtcRoomRecord | null> {
    return this.queue.enqueue(
      () => this.handleVoiceJoin(member, triggerChannelId),
      TaskPriority.HIGH,
    );
  }

  /**
   * Enqueues a member direct join event with HIGH priority in the operation queue.
   */
  public async queueMemberJoin(
    member: GuildMember,
    channel: VoiceChannel,
  ): Promise<void> {
    return this.queue.enqueue(
      () => this.handleMemberJoin(member, channel),
      TaskPriority.HIGH,
    );
  }

  /**
   * Enqueues a member leave event with LOW priority in the operation queue.
   */
  public async queueVoiceLeave(
    channel: VoiceChannel,
    member?: GuildMember,
  ): Promise<void> {
    return this.queue.enqueue(
      () => this.handleVoiceLeave(channel, member),
      TaskPriority.LOW,
      `private-leave:${channel.id}`,
    );
  }
}
