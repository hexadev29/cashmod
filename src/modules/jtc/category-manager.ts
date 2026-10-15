import { ChannelType, type Guild, type CategoryChannel } from "discord.js";
import type {
  JtcConfig,
  JtcCategoryName,
} from "../../../config/jtc/jtc.config.js";
import { JtcStateStore } from "./jtc-state-store.js";
import { AsyncLock } from "./room-allocator.js";
import {
  calculateCategoryTargetPosition,
  type ExistingCategoryInfo,
} from "./room-positioner.js";
import { logger } from "../../diagnostics/logger.js";

export class CategoryManager {
  private readonly categoryMap = new Map<JtcCategoryName, string>();
  private readonly idToCategoryName = new Map<string, JtcCategoryName>();
  private readonly categoryLock = new AsyncLock();
  private initialized = false;
  private readonly log = logger.child({ subsystem: "CategoryManager" });

  constructor(
    private readonly config: JtcConfig,
    private readonly stateStore: JtcStateStore = new JtcStateStore(),
  ) {}

  public isInitialized(): boolean {
    return this.initialized;
  }

  public hasCategory(name: JtcCategoryName): boolean {
    return this.categoryMap.has(name);
  }

  public getCategoryId(name: JtcCategoryName): string | undefined {
    return this.categoryMap.get(name);
  }

  public getCategoryNameById(id: string): JtcCategoryName | undefined {
    return this.idToCategoryName.get(id);
  }

  public isManagedCategory(id: string): boolean {
    return this.idToCategoryName.has(id);
  }

  public getAllManagedCategoryIds(): string[] {
    return Array.from(this.categoryMap.values());
  }

  /**
   * Initial step: checks Discord anchor category and loads previously persisted
   * runtime state from disk if any exists.
   * DOES NOT create any dynamic categories eagerly. Dynamic categories are only
   * created on demand when a user joins a trigger.
   */
  public async initFromState(guild: Guild): Promise<void> {
    const anchorId = this.config.anchorCategoryId;

    // 1. Validate anchor category existence
    try {
      const fetched = await guild.channels.fetch(anchorId);
      if (!fetched || fetched.type !== ChannelType.GuildCategory) {
        this.log.warn(
          `Configured anchor channel "${anchorId}" was not found in guild or is not a Category channel. Dynamic categories will require a valid anchor.`,
          { anchorId, guildId: guild.id },
        );
      } else {
        this.log.info(
          `Anchor category "${fetched.name}" (${fetched.id}) verified successfully.`,
        );
      }
    } catch (err: any) {
      this.log.warn(
        `Failed to resolve anchor category "${anchorId}": ${err?.message}`,
        { anchorId, guildId: guild.id },
      );
    }

    // 2. Fetch current guild channels to verify any existing saved categories
    const guildChannels = await guild.channels.fetch();

    // 3. Load saved state from disk
    const savedMapping = await this.stateStore.loadState(guild.id, anchorId);

    this.categoryMap.clear();
    this.idToCategoryName.clear();

    if (savedMapping) {
      for (const [name, catId] of Object.entries(savedMapping) as [
        JtcCategoryName,
        string,
      ][]) {
        if (!catId) continue;
        const discordChannel = guildChannels.get(catId);
        if (
          discordChannel &&
          discordChannel.type === ChannelType.GuildCategory &&
          discordChannel.name.toLowerCase() === name.toLowerCase()
        ) {
          this.categoryMap.set(name, catId);
          this.idToCategoryName.set(catId, name);
          this.log.debug(`Reused existing valid category "${name}" (${catId})`);
        } else {
          this.log.warn(
            `Previously saved category "${name}" (${catId}) is missing or modified in Discord; will be re-created on demand.`,
          );
        }
      }
    }

    // 4. Also discover previously created matching categories in Discord if state file was missing
    for (const catName of this.config.categoryOrder) {
      if (this.categoryMap.has(catName)) continue;

      for (const [, ch] of guildChannels) {
        if (
          ch != null &&
          ch.type === ChannelType.GuildCategory &&
          ch.name.toLowerCase() === catName.toLowerCase() &&
          ch.id !== anchorId
        ) {
          this.categoryMap.set(catName, ch.id);
          this.idToCategoryName.set(ch.id, catName);
          this.log.info(
            `Discovered existing matching category "${catName}" (${ch.id}); adopting.`,
          );
          break;
        }
      }
    }

    this.initialized = true;
    this.log.info(
      `JTC dynamic categories initialized from state (${this.categoryMap.size} active category/categories present).`,
    );

    // Realign any existing categories to ensure contiguous order below anchor
    if (this.categoryMap.size > 0) {
      await this.realignManagedCategories(guild);
    }
  }

  /**
   * Resolves an existing dynamic category ID, or creates it on demand if it does not exist yet.
   * Uses lock synchronization to prevent concurrent creations of the same category.
   */
  public async getOrCreateCategory(
    guild: Guild,
    categoryName: JtcCategoryName,
  ): Promise<string> {
    // Fast path: already known and cached
    const existingId = this.categoryMap.get(categoryName);
    if (existingId) {
      const cached = guild.channels.cache?.get(existingId);
      if (cached && cached.type === ChannelType.GuildCategory) {
        return existingId;
      }
    }

    // Acquire lock for this specific category name
    const release = await this.categoryLock.acquire(`cat:${categoryName}`);
    try {
      // Re-check after lock
      const recheckedId = this.categoryMap.get(categoryName);
      if (recheckedId) {
        try {
          const fetched = await guild.channels.fetch(recheckedId);
          if (fetched && fetched.type === ChannelType.GuildCategory) {
            return recheckedId;
          }
        } catch {
          // Channel might have been deleted, proceed to re-create
          this.categoryMap.delete(categoryName);
          this.idToCategoryName.delete(recheckedId);
        }
      }

      // Check current guild channels
      const guildChannels = await guild.channels.fetch();
      for (const [, ch] of guildChannels) {
        if (
          ch != null &&
          ch.type === ChannelType.GuildCategory &&
          ch.name.toLowerCase() === categoryName.toLowerCase() &&
          ch.id !== this.config.anchorCategoryId
        ) {
          this.categoryMap.set(categoryName, ch.id);
          this.idToCategoryName.set(ch.id, categoryName);
          await this.persistState(guild.id);
          return ch.id;
        }
      }

      // Need to create dynamically below anchor category
      const anchorId = this.config.anchorCategoryId;
      let anchorChannel: CategoryChannel;
      try {
        const fetchedAnchor = await guild.channels.fetch(anchorId);
        if (
          !fetchedAnchor ||
          fetchedAnchor.type !== ChannelType.GuildCategory
        ) {
          throw new Error(
            `Anchor channel "${anchorId}" was not found in guild or is not a Category channel.`,
          );
        }
        anchorChannel = fetchedAnchor as CategoryChannel;
      } catch (err: any) {
        this.log.error(
          `Failed to resolve anchor category "${anchorId}": ${err?.message}`,
          { anchorId, guildId: guild.id },
          err,
        );
        throw new Error(`Anchor category verification failed: ${err?.message}`);
      }

      // Collect existing active managed categories with their current positions
      const existingCategories: ExistingCategoryInfo[] = [];
      for (const [name, id] of this.categoryMap.entries()) {
        const ch = guildChannels.get(id);
        if (ch && ch.type === ChannelType.GuildCategory) {
          existingCategories.push({
            name,
            position: (ch as CategoryChannel).position,
          });
        }
      }

      const targetPosition = calculateCategoryTargetPosition(
        categoryName,
        this.config.categoryOrder,
        existingCategories,
        anchorChannel.position,
      );

      this.log.info(
        `Dynamically creating category "${categoryName}" at target position ${targetPosition} relative to anchor "${anchorChannel.name}"`,
      );

      const created = (await guild.channels.create({
        name: categoryName,
        type: ChannelType.GuildCategory,
        position: targetPosition,
        reason: `Cash Mod dynamic JTC category creation for ${categoryName}`,
      })) as CategoryChannel;

      this.categoryMap.set(categoryName, created.id);
      this.idToCategoryName.set(created.id, categoryName);

      await this.persistState(guild.id);
      this.log.info(
        `Created dynamic category "${categoryName}" with generated ID: ${created.id}`,
      );

      // Re-align all managed categories to enforce contiguous ordering below anchor
      await this.realignManagedCategories(guild);

      return created.id;
    } finally {
      release();
    }
  }

  /**
   * Checks if a managed dynamic category has no remaining voice channels,
   * and deletes the category if empty.
   */
  public async deleteCategoryIfEmpty(
    guild: Guild,
    categoryId: string,
  ): Promise<boolean> {
    const categoryName = this.idToCategoryName.get(categoryId);
    if (!categoryName) {
      return false;
    }

    const release = await this.categoryLock.acquire(`cat:${categoryName}`);
    try {
      const guildChannels = await guild.channels.fetch();

      // Check if any voice channels remain in this category
      const remainingVoice = Array.from(guildChannels.values()).filter(
        (ch) =>
          ch != null &&
          (typeof (ch as any).isVoiceBased === "function"
            ? (ch as any).isVoiceBased()
            : ch.type === ChannelType.GuildVoice) &&
          ch.parentId === categoryId,
      );

      if (remainingVoice.length > 0) {
        return false;
      }

      // No voice channels remain in this category; delete the category from Discord
      const categoryChannel = guildChannels.get(categoryId);
      if (categoryChannel) {
        try {
          await categoryChannel.delete("Cash Mod JTC empty category cleanup");
          this.log.info(
            `Deleted empty dynamic JTC category "${categoryName}" (${categoryId})`,
          );
        } catch (err: any) {
          if (err?.code !== 10003) {
            this.log.error(
              `Failed to delete empty category "${categoryName}": ${err?.message}`,
              undefined,
              err,
            );
          }
        }
      }

      this.categoryMap.delete(categoryName);
      this.idToCategoryName.delete(categoryId);
      await this.persistState(guild.id);
      if (this.categoryMap.size > 0) {
        await this.realignManagedCategories(guild);
      }
      return true;
    } finally {
      release();
    }
  }

  /**
   * Persists the current category mapping to disk.
   */
  private async persistState(guildId: string): Promise<void> {
    const stateToSave: Partial<Record<JtcCategoryName, string>> = {};
    for (const [name, id] of this.categoryMap.entries()) {
      stateToSave[name] = id;
    }

    if (Object.keys(stateToSave).length === 0) {
      await this.stateStore.clearState();
      return;
    }

    try {
      await this.stateStore.saveState(
        guildId,
        this.config.anchorCategoryId,
        stateToSave,
      );
      this.log.debug(
        `Successfully persisted ${this.categoryMap.size} JTC category IDs to disk.`,
      );
    } catch (saveErr: any) {
      this.log.error(
        `Failed to persist runtime category state: ${saveErr?.message}`,
        undefined,
        saveErr,
      );
    }
  }

  /**
   * Compatibility method: initializes state from disk and returns current active categories.
   */
  public async ensureInitialized(
    guild: Guild,
  ): Promise<Map<JtcCategoryName, string>> {
    if (!this.initialized) {
      await this.initFromState(guild);
    }
    return this.categoryMap;
  }

  /**
   * Enforces that all currently managed dynamic categories are positioned
   * contiguously directly below the anchor category, in the exact configured order:
   * Solo → Duo → Trio → Quad → Penta → Hepta → Septa → Octa.
   */
  public async realignManagedCategories(guild: Guild): Promise<void> {
    if (this.categoryMap.size === 0) {
      return;
    }

    try {
      const anchorId = this.config.anchorCategoryId;
      const fetchedAnchor = await guild.channels.fetch(anchorId);
      if (!fetchedAnchor || fetchedAnchor.type !== ChannelType.GuildCategory) {
        return;
      }
      const anchorPosition = (fetchedAnchor as CategoryChannel).position;

      const guildChannels = await guild.channels.fetch();
      const managedCats: { id: string; name: JtcCategoryName; currentPosition: number }[] = [];

      for (const [name, id] of this.categoryMap.entries()) {
        const ch = guildChannels.get(id);
        if (ch && ch.type === ChannelType.GuildCategory) {
          managedCats.push({
            id,
            name,
            currentPosition: (ch as CategoryChannel).position,
          });
        }
      }

      if (managedCats.length === 0) {
        return;
      }

      // Sort existing managed categories by configured categoryOrder
      managedCats.sort(
        (a, b) =>
          this.config.categoryOrder.indexOf(a.name) -
          this.config.categoryOrder.indexOf(b.name),
      );

      const needsRealignment = managedCats.some(
        (cat, i) => cat.currentPosition !== anchorPosition + 1 + i,
      );

      if (
        needsRealignment &&
        typeof guild.channels?.setPositions === "function"
      ) {
        const updates = managedCats.map((cat, i) => ({
          channel: cat.id,
          position: anchorPosition + 1 + i,
        }));
        this.log.info(
          `Re-aligning ${updates.length} dynamic JTC category position(s) contiguously below anchor "${fetchedAnchor.name}"`,
          { updates },
        );
        await guild.channels.setPositions(updates);
      }
    } catch (err: any) {
      this.log.warn(
        `Failed to realign managed category positions: ${err?.message}`,
        undefined,
        err,
      );
    }
  }
}

