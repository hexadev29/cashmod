import { ChannelType, type Guild } from "discord.js";
import { logger } from "../../diagnostics/logger.js";
import type { PrivateJtcConfig } from "../../../config/private-jtc/private-jtc.config.js";
import type { PrivateJtcStateStore } from "./private-jtc-state-store.js";

export class PrivateCategoryManager {
  private categoryId: string;
  private readonly log = logger.child({ subsystem: "PrivateCategoryManager" });

  constructor(
    config: PrivateJtcConfig,
    _stateStore?: PrivateJtcStateStore,
  ) {
    this.categoryId = config.categoryId;
  }

  public getCategoryId(): string {
    return this.categoryId;
  }

  public isManagedCategory(id: string): boolean {
    return this.categoryId === id;
  }

  /**
   * Verifies that the predefined private category exists in the guild.
   */
  public async initFromState(guild: Guild): Promise<void> {
    const guildChannels = await guild.channels.fetch().catch(() => null);
    const categoryChannel = guildChannels?.get(this.categoryId) ?? null;

    if (!categoryChannel || categoryChannel.type !== ChannelType.GuildCategory) {
      this.log.warn(
        `Configured private category ID "${this.categoryId}" does not exist or is not a category in guild "${guild.name}" (${guild.id}).`,
      );
      return;
    }

    this.log.info(
      `Predefined private category "${categoryChannel.name}" (${this.categoryId}) verified successfully.`,
    );
  }

  /**
   * Returns the predefined private category ID.
   */
  public async getOrCreateCategory(_guild: Guild): Promise<string> {
    return this.categoryId;
  }

  /**
   * Predefined private category is permanent and positioned by the server admin; realignment is a no-op.
   */
  public async realignCategory(_guild: Guild): Promise<void> {
    // No-op for predefined category
  }

  /**
   * Predefined private category is permanent and never deleted when empty.
   */
  public async deleteCategoryIfEmpty(_guild: Guild): Promise<boolean> {
    return false;
  }
}
