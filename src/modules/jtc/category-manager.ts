import { ChannelType, type Guild, type CategoryChannel } from "discord.js";
import type {
  JtcConfig,
  JtcCategoryName,
} from "../../../config/jtc/jtc.config.js";
import { JtcStateStore } from "./jtc-state-store.js";
import { logger } from "../../diagnostics/logger.js";

export class CategoryManager {
  private readonly categoryMap = new Map<JtcCategoryName, string>();
  private readonly idToCategoryName = new Map<string, JtcCategoryName>();
  private initPromise: Promise<Map<JtcCategoryName, string>> | null = null;
  private readonly log = logger.child({ subsystem: "CategoryManager" });

  constructor(
    private readonly config: JtcConfig,
    private readonly stateStore: JtcStateStore = new JtcStateStore(),
  ) {}

  public isInitialized(): boolean {
    return (
      this.categoryMap.size === this.config.categoryOrder.length &&
      this.config.categoryOrder.every((cat) => this.categoryMap.has(cat))
    );
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
   * Ensures that all 8 JTC categories are initialized, created in Discord, and persisted.
   * Uses single-flight synchronization so concurrent calls share the same execution.
   */
  public async ensureInitialized(
    guild: Guild,
  ): Promise<Map<JtcCategoryName, string>> {
    if (this.isInitialized()) {
      return this.categoryMap;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.performInitialization(guild);

    try {
      const result = await this.initPromise;
      return result;
    } finally {
      this.initPromise = null;
    }
  }

  private async performInitialization(
    guild: Guild,
  ): Promise<Map<JtcCategoryName, string>> {
    this.log.info(
      `Initializing dynamic JTC categories for guild "${guild.name}" (${guild.id})...`,
    );

    // 1. Validate anchor category
    const anchorId = this.config.anchorCategoryId;
    let anchorChannel: CategoryChannel;

    try {
      const fetched = await guild.channels.fetch(anchorId);
      if (!fetched || fetched.type !== ChannelType.GuildCategory) {
        throw new Error(
          `Configured anchor channel "${anchorId}" was not found in guild or is not a Category channel.`,
        );
      }
      anchorChannel = fetched as CategoryChannel;
    } catch (err: any) {
      this.log.error(
        `Failed to resolve anchor category "${anchorId}": ${err?.message}`,
        { anchorId, guildId: guild.id },
        err,
      );
      throw new Error(`Anchor category verification failed: ${err?.message}`);
    }

    // 2. Fetch current guild channels to verify existence
    const guildChannels = await guild.channels.fetch();

    // 3. Load saved state from disk
    const savedMapping = await this.stateStore.loadState(guild.id, anchorId);
    const resolved = new Map<JtcCategoryName, string>();

    // 4. Verify existing saved categories in Discord
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
          resolved.set(name, catId);
          this.log.debug(`Reused existing valid category "${name}" (${catId})`);
        } else {
          this.log.warn(
            `Previously saved category "${name}" (${catId}) is missing or modified in Discord; will re-create/recover.`,
          );
        }
      }
    }

    // 5. Discover previously created categories if state was missing
    if (resolved.size < this.config.categoryOrder.length) {
      for (const catName of this.config.categoryOrder) {
        if (resolved.has(catName)) continue;

        // Search for existing category channels matching the name positioned around the anchor
        let matchingCategory: any = null;
        for (const [, ch] of guildChannels) {
          if (
            ch != null &&
            ch.type === ChannelType.GuildCategory &&
            ch.name.toLowerCase() === catName.toLowerCase() &&
            ch.id !== anchorId
          ) {
            matchingCategory = ch;
            break;
          }
        }

        if (matchingCategory) {
          resolved.set(catName, matchingCategory.id);
          this.log.info(
            `Discovered previously created matching category "${catName}" (${matchingCategory.id}); adopting.`,
          );
        }
      }
    }

    // 6. Create any remaining missing categories in exact order: Solo -> Octa
    const anchorPosition = anchorChannel.position;

    for (let index = 0; index < this.config.categoryOrder.length; index++) {
      const catName = this.config.categoryOrder[index];
      if (resolved.has(catName)) continue;

      const targetPosition = anchorPosition + 1 + index;
      this.log.info(
        `Dynamically creating category "${catName}" at target position ${targetPosition} below anchor "${anchorChannel.name}"`,
      );

      try {
        const created = (await guild.channels.create({
          name: catName,
          type: ChannelType.GuildCategory,
          position: targetPosition,
          reason: "Cash Mod dynamic JTC category creation",
        })) as CategoryChannel;

        resolved.set(catName, created.id);
        this.log.info(
          `Created category "${catName}" with generated ID: ${created.id}`,
        );
      } catch (createErr: any) {
        this.log.error(
          `Failed to create Discord category "${catName}": ${createErr?.message}`,
          { catName, targetPosition },
          createErr,
        );
        throw createErr;
      }
    }

    // 7. Persist updated category state atomically
    const stateToSave: Partial<Record<JtcCategoryName, string>> = {};
    for (const [name, id] of resolved.entries()) {
      stateToSave[name] = id;
    }

    try {
      await this.stateStore.saveState(guild.id, anchorId, stateToSave);
      this.log.info(
        `Successfully persisted ${resolved.size} JTC category IDs to disk.`,
      );
    } catch (saveErr: any) {
      this.log.error(
        `Failed to persist runtime category state: ${saveErr?.message}`,
        undefined,
        saveErr,
      );
      throw new Error(`State persistence failure: ${saveErr?.message}`);
    }

    // 8. Commit to in-memory cache
    this.categoryMap.clear();
    this.idToCategoryName.clear();

    for (const [name, id] of resolved.entries()) {
      this.categoryMap.set(name, id);
      this.idToCategoryName.set(id, name);
    }

    this.log.info(
      `Dynamic JTC categories initialized successfully (${this.categoryMap.size}/8 categories ready).`,
    );
    return this.categoryMap;
  }
}
