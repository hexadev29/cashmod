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
    const anchorChannel = await guild.channels
      .fetch(this.config.anchorCategoryId)
      .catch(() => null);

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
      const existingCat = await guild.channels
        .fetch(loaded.categoryId)
        .catch(() => null);
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

      const anchor = (await guild.channels
        .fetch(this.config.anchorCategoryId)
        .catch(() => null)) as CategoryChannel | null;

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

      return newCategory.id;
    } finally {
      release();
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
        await this.stateStore.clearState();
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
