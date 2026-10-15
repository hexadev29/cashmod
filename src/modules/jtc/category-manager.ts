import { ChannelType, type Guild } from "discord.js";
import type {
  JtcConfig,
  JtcCategoryName,
} from "../../../config/jtc/jtc.config.js";
import type { JtcStateStore } from "./jtc-state-store.js";
import { logger } from "../../diagnostics/logger.js";

export class CategoryManager {
  private readonly categoryMap = new Map<JtcCategoryName, string>();
  private readonly idToCategoryName = new Map<string, JtcCategoryName>();
  private initialized = false;
  private readonly log = logger.child({ subsystem: "CategoryManager" });

  constructor(
    private readonly config: JtcConfig,
    _stateStore?: JtcStateStore,
  ) {
    this.populateCategories();
  }

  private populateCategories(): void {
    this.categoryMap.clear();
    this.idToCategoryName.clear();

    if (this.config.categories) {
      for (const [name, def] of Object.entries(this.config.categories) as [
        JtcCategoryName,
        { categoryId?: string },
      ][]) {
        const catId = def?.categoryId || this.config.anchorCategoryId;
        if (catId) {
          this.categoryMap.set(name, catId);
          this.idToCategoryName.set(catId, name);
        }
      }
    }
  }

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
   * Verifies that all predefined categories exist in the guild.
   */
  public async initFromState(guild: Guild): Promise<void> {
    this.populateCategories();

    const guildChannels = await guild.channels.fetch().catch(() => null);

    for (const [name, catId] of this.categoryMap.entries()) {
      const channel = guildChannels?.get(catId);
      if (!channel || channel.type !== ChannelType.GuildCategory) {
        this.log.warn(
          `Predefined JTC category "${name}" (${catId}) was not found in guild "${guild.name}" (${guild.id}) or is not a Category channel.`,
          { categoryName: name, categoryId: catId, guildId: guild.id },
        );
      } else {
        this.log.info(
          `Predefined JTC category "${name}" ("${channel.name}" - ${catId}) verified successfully.`,
        );
      }
    }

    this.initialized = true;
    this.log.info(
      `JTC predefined categories initialized (${this.categoryMap.size} category/categories configured).`,
    );
  }

  /**
   * Resolves the predefined category ID for the given category name.
   */
  public async getOrCreateCategory(
    _guild: Guild,
    categoryName: JtcCategoryName,
  ): Promise<string> {
    const catId = this.categoryMap.get(categoryName);
    if (!catId) {
      throw new Error(
        `Predefined category ID not configured for JTC category "${categoryName}".`,
      );
    }
    return catId;
  }

  /**
   * Predefined categories are permanent and never deleted when empty.
   */
  public async deleteCategoryIfEmpty(
    _guild: Guild,
    _categoryId: string,
  ): Promise<boolean> {
    return false;
  }

  /**
   * Predefined categories are positioned by the server administrator; realignment is a no-op.
   */
  public async realignManagedCategories(_guild: Guild): Promise<void> {
    // No-op for predefined categories
  }

  public async ensureInitialized(
    guild: Guild,
  ): Promise<Map<JtcCategoryName, string>> {
    if (!this.initialized) {
      await this.initFromState(guild);
    }
    return this.categoryMap;
  }
}
