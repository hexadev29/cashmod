import {
  ChannelType,
  type CategoryChannel,
  type Guild,
} from "discord.js";
import { AsyncLock } from "../jtc/room-allocator.js";
import { logger } from "../../diagnostics/logger.js";
import type { PrivateJtcConfig } from "../../../config/private-jtc/private-jtc.config.js";
import { PrivateJtcStateStore } from "./private-jtc-state-store.js";

export class PrivateCategoryManager {
  private categoryId: string | null = null;
  private readonly asyncLock = new AsyncLock();
  private lastRealignTimestamp = 0;
  private readonly isTest = process.env.NODE_ENV === "test";
  private readonly log = logger.child({ subsystem: "PrivateCategoryManager" });

  constructor(
    private readonly config: PrivateJtcConfig,
    private readonly stateStore: PrivateJtcStateStore = new PrivateJtcStateStore(
      config.stateFilePath,
    ),
  ) {}

  public getCategoryId(): string | null {
    return this.categoryId;
  }

  public isManagedCategory(id: string): boolean {
    return this.categoryId === id;
  }

  /**
   * Initializes category state from disk on startup and verifies anchor category.
   */
  public async initFromState(guild: Guild): Promise<void> {
    const guildChannels = await guild.channels.fetch().catch(() => null);
    const anchorChannel = guildChannels?.get(this.config.anchorCategoryId) ?? null;

    if (!anchorChannel || anchorChannel.type !== ChannelType.GuildCategory) {
      this.log.error(
        `Configured private anchor category ID "${this.config.anchorCategoryId}" does not exist or is not a category in guild "${guild.name}" (${guild.id}).`,
      );
      return;
    }

    const loaded = await this.stateStore.loadState(
      guild.id,
      this.config.anchorCategoryId,
    );
    if (loaded?.categoryId) {
      const existingCat = guildChannels?.get(loaded.categoryId) ?? null;
      if (existingCat && existingCat.type === ChannelType.GuildCategory) {
        this.categoryId = loaded.categoryId;
        this.log.info(
          `Restored private dynamic category "${existingCat.name}" (${existingCat.id}) from state.`,
        );
      } else {
        this.categoryId = null;
        this.log.warn(
          `Private category ${loaded.categoryId} in state no longer exists in Discord. Discarding.`,
        );
      }
    }

    // Check if category wasn't restored from state, but already exists in guild with matching name
    if (!this.categoryId && guildChannels) {
      for (const [, ch] of guildChannels) {
        if (
          ch != null &&
          ch.type === ChannelType.GuildCategory &&
          ch.name.toLowerCase() === this.config.categoryName.toLowerCase() &&
          ch.id !== this.config.anchorCategoryId
        ) {
          this.categoryId = ch.id;
          this.log.info(
            `Discovered existing private category "${ch.name}" (${ch.id}) in guild; adopting.`,
          );
          const currentState = (await this.stateStore.loadState(
            guild.id,
            this.config.anchorCategoryId,
          )) ?? { rooms: {} };
          currentState.categoryId = ch.id;
          await this.stateStore.saveState(
            guild.id,
            this.config.anchorCategoryId,
            currentState,
          );
          break;
        }
      }
    }

    if (this.categoryId) {
      await this.realignCategory(guild);
    }
  }

  /**
   * Resolves or dynamically creates the Private category on demand immediately below the anchor.
   */
  public async getOrCreateCategory(guild: Guild): Promise<string> {
    if (this.categoryId) {
      const existing = await guild.channels
        .fetch(this.categoryId)
        .catch(() => null);
      if (existing && existing.type === ChannelType.GuildCategory) {
        return this.categoryId;
      }
      this.categoryId = null;
    }

    const release = await this.asyncLock.acquire("create-private-category");
    try {
      if (this.categoryId) {
        return this.categoryId;
      }

      const guildChannels = await guild.channels.fetch();

      // Check if a category matching the configured name already exists in guild
      for (const [, ch] of guildChannels) {
        if (
          ch != null &&
          ch.type === ChannelType.GuildCategory &&
          ch.name.toLowerCase() === this.config.categoryName.toLowerCase() &&
          ch.id !== this.config.anchorCategoryId
        ) {
          this.categoryId = ch.id;
          this.log.info(
            `Discovered existing private category "${ch.name}" (${ch.id}); adopting.`,
          );
          const currentState = (await this.stateStore.loadState(
            guild.id,
            this.config.anchorCategoryId,
          )) ?? { rooms: {} };
          currentState.categoryId = ch.id;
          await this.stateStore.saveState(
            guild.id,
            this.config.anchorCategoryId,
            currentState,
          );
          await this.realignCategory(guild);
          return ch.id;
        }
      }

      const anchor = guildChannels.get(
        this.config.anchorCategoryId,
      ) as CategoryChannel | undefined;

      if (!anchor || anchor.type !== ChannelType.GuildCategory) {
        throw new Error(
          `Private anchor category ${this.config.anchorCategoryId} not found in guild ${guild.id}`,
        );
      }

      const targetPosition = anchor.position + 1;

      this.log.info(
        `Dynamically creating private category "${this.config.categoryName}" at position ${targetPosition} relative to anchor "${anchor.name}"`,
      );

      const newCategory = (await guild.channels.create({
        name: this.config.categoryName,
        type: ChannelType.GuildCategory,
        position: targetPosition,
        reason: "Cash Mod Private JTC dynamic category on-demand creation",
      })) as CategoryChannel;

      this.categoryId = newCategory.id;

      // Update persisted state
      const currentState = (await this.stateStore.loadState(
        guild.id,
        this.config.anchorCategoryId,
      )) ?? { rooms: {} };

      currentState.categoryId = newCategory.id;
      await this.stateStore.saveState(
        guild.id,
        this.config.anchorCategoryId,
        currentState,
      );

      this.log.info(
        `Created private dynamic category "${this.config.categoryName}" (${newCategory.id})`,
      );

      // Re-align explicitly to guarantee placement directly below anchor
      try {
        if (typeof newCategory.setPosition === "function") {
          await newCategory.setPosition(targetPosition, {
            reason: "Cash Mod Private JTC category alignment below anchor",
          });
        } else if (typeof guild.channels?.setPositions === "function") {
          await guild.channels.setPositions([
            { channel: newCategory.id, position: targetPosition },
          ]);
        }
      } catch (posErr: any) {
        this.log.warn(
          `Failed to explicitly set position for private category: ${posErr?.message}`,
        );
      }

      return newCategory.id;
    } finally {
      release();
    }
  }

  /**
   * Enforces that the managed dynamic private category is positioned
   * directly below the anchor category (anchor.position + 1).
   */
  public async realignCategory(guild: Guild): Promise<void> {
    if (!this.categoryId) {
      return;
    }

    try {
      const guildChannels = await guild.channels.fetch();
      const anchor = guildChannels.get(this.config.anchorCategoryId);
      if (!anchor || anchor.type !== ChannelType.GuildCategory) {
        return;
      }
      const anchorCategory = anchor as CategoryChannel;
      const targetPosition = anchorCategory.position + 1;

      const managed = guildChannels.get(this.categoryId);
      if (!managed || managed.type !== ChannelType.GuildCategory) {
        return;
      }
      const managedCategory = managed as CategoryChannel;

      if (managedCategory.position !== targetPosition) {
        if (!this.isTest && Date.now() - this.lastRealignTimestamp < 3000) {
          return;
        }
        this.lastRealignTimestamp = Date.now();
        this.log.info(
          `Re-aligning private category "${managedCategory.name}" position from ${managedCategory.position} to ${targetPosition} directly below anchor "${anchorCategory.name}" (${anchorCategory.position})`,
        );
        if (typeof managedCategory.setPosition === "function") {
          await managedCategory.setPosition(targetPosition, {
            reason: "Cash Mod Private JTC category realignment below anchor",
          });
        } else if (typeof guild.channels?.setPositions === "function") {
          await guild.channels.setPositions([
            { channel: managedCategory.id, position: targetPosition },
          ]);
        }
      }
    } catch (err: any) {
      this.log.warn(
        `Failed to realign private category position: ${err?.message}`,
        undefined,
        err,
      );
    }
  }

  /**
   * Deletes the dynamic private category if no voice channels remain inside it.
   */
  public async deleteCategoryIfEmpty(guild: Guild): Promise<boolean> {
    if (!this.categoryId) {
      return false;
    }

    const release = await this.asyncLock.acquire("delete-private-category");
    try {
      if (!this.categoryId) return false;

      const channels = await guild.channels.fetch();
      const remainingChildren = channels.filter(
        (ch) => ch && ch.parentId === this.categoryId,
      );

      if (remainingChildren.size === 0) {
        const cat = await guild.channels.fetch(this.categoryId).catch(() => null);
        if (cat) {
          this.log.info(
            `Deleting empty private dynamic category "${cat.name}" (${this.categoryId})`,
          );
          await cat.delete("Private JTC category cleanup: 0 rooms remain");
        }
        this.categoryId = null;
        const currentState = await this.stateStore.loadState(
          guild.id,
          this.config.anchorCategoryId,
        );
        if (currentState) {
          currentState.categoryId = undefined;
          await this.stateStore.saveState(
            guild.id,
            this.config.anchorCategoryId,
            currentState,
          );
        }
        return true;
      }
      return false;
    } catch (err: any) {
      this.log.error(
        `Failed to delete private category ${this.categoryId}: ${err?.message}`,
        undefined,
        err,
      );
      return false;
    } finally {
      release();
    }
  }
}
