import fs from "node:fs";
import path from "node:path";
import { AsyncLock } from "./room-allocator.js";
import { logger } from "../../diagnostics/logger.js";
import type { JtcCategoryName } from "../../../config/jtc/jtc.config.js";

export interface JtcPersistentState {
  version: 1;
  guildId: string;
  anchorCategoryId: string;
  categories: Partial<Record<JtcCategoryName, string>>;
  updatedAt?: string;
}

export class JtcStateStore {
  private readonly writeLock = new AsyncLock();
  private readonly log = logger.child({ subsystem: "JtcStateStore" });

  constructor(
    private readonly filePath: string = path.resolve(
      process.cwd(),
      "data/state/jtc-categories.json",
    ),
  ) {}

  public getFilePath(): string {
    return this.filePath;
  }

  /**
   * Loads and validates persistent JTC categories state from disk.
   * Returns null if file is missing, malformed, or associated with a different guild or anchor.
   */
  public async loadState(
    expectedGuildId: string,
    expectedAnchorId: string,
  ): Promise<Partial<Record<JtcCategoryName, string>> | null> {
    if (!fs.existsSync(this.filePath)) {
      this.log.debug(`No existing state file found at: ${this.filePath}`);
      return null;
    }

    try {
      const rawContent = await fs.promises.readFile(this.filePath, "utf-8");
      if (!rawContent || rawContent.trim().length === 0) {
        this.log.warn(`State file at ${this.filePath} is empty.`);
        return null;
      }

      const parsed = JSON.parse(rawContent) as JtcPersistentState;

      // Validate schema version
      if (parsed.version !== 1) {
        this.log.warn(
          `Unsupported state version: ${parsed.version} at ${this.filePath}`,
        );
        return null;
      }

      // Validate guild association
      if (parsed.guildId !== expectedGuildId) {
        this.log.warn(
          `State file guild mismatch: found "${parsed.guildId}", expected "${expectedGuildId}". Discarding stale state.`,
        );
        return null;
      }

      // Validate anchor category association
      if (parsed.anchorCategoryId !== expectedAnchorId) {
        this.log.warn(
          `State file anchor mismatch: found "${parsed.anchorCategoryId}", expected "${expectedAnchorId}". Discarding stale state.`,
        );
        return null;
      }

      // Validate categories structure
      if (!parsed.categories || typeof parsed.categories !== "object") {
        this.log.warn(
          `State file has invalid categories object at ${this.filePath}`,
        );
        return null;
      }

      this.log.info(
        `Loaded valid JTC runtime state (${Object.keys(parsed.categories).length} categories) from ${this.filePath}`,
      );
      return parsed.categories;
    } catch (err: any) {
      this.log.error(
        `Failed to read/parse state file at ${this.filePath}: ${err?.message}`,
        undefined,
        err,
      );
      return null;
    }
  }

  /**
   * Atomically writes state to disk using a temporary file and rename.
   */
  public async saveState(
    guildId: string,
    anchorCategoryId: string,
    categories: Partial<Record<JtcCategoryName, string>>,
  ): Promise<void> {
    if (Object.keys(categories).length === 0) {
      throw new Error("Refusing to persist empty categories mapping.");
    }

    const release = await this.writeLock.acquire("state-file");
    try {
      const state: JtcPersistentState = {
        version: 1,
        guildId,
        anchorCategoryId,
        categories,
        updatedAt: new Date().toISOString(),
      };

      const dir = path.dirname(this.filePath);
      await fs.promises.mkdir(dir, { recursive: true });

      const tempFilePath = `${this.filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
      const serialized = JSON.stringify(state, null, 2);

      await fs.promises.writeFile(tempFilePath, serialized, "utf-8");
      await fs.promises.rename(tempFilePath, this.filePath);

      this.log.debug(`Atomically saved JTC category state to ${this.filePath}`);
    } finally {
      release();
    }
  }
}
