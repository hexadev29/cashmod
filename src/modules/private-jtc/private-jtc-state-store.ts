import fs from "node:fs";
import path from "node:path";
import { AsyncLock } from "../jtc/room-allocator.js";
import { logger } from "../../diagnostics/logger.js";
import type { PrivateJtcRoomRecord, PrivateJtcState } from "./private-jtc-types.js";

export interface PrivateJtcPersistentDocument {
  version: 1;
  guildId: string;
  anchorCategoryId: string;
  categoryId?: string;
  rooms: Record<string, PrivateJtcRoomRecord>;
  updatedAt: string;
}

export class PrivateJtcStateStore {
  private readonly writeLock = new AsyncLock();
  private readonly log = logger.child({ subsystem: "PrivateJtcStateStore" });

  constructor(
    private readonly filePath: string = path.resolve(
      process.cwd(),
      "data/private-jtc-state.json",
    ),
  ) {}

  public getFilePath(): string {
    return this.filePath;
  }

  /**
   * Loads and validates persistent Private JTC state from disk.
   */
  public async loadState(
    expectedGuildId: string,
    expectedAnchorId: string,
  ): Promise<PrivateJtcState | null> {
    if (!fs.existsSync(this.filePath)) {
      this.log.debug(`No existing state file found at: ${this.filePath}`);
      return null;
    }

    try {
      const rawContent = await fs.promises.readFile(this.filePath, "utf-8");
      if (!rawContent || rawContent.trim().length === 0) {
        return null;
      }

      const parsed = JSON.parse(rawContent) as PrivateJtcPersistentDocument;

      if (parsed.version !== 1) {
        this.log.warn(
          `Unsupported state version: ${parsed.version} at ${this.filePath}`,
        );
        return null;
      }

      if (parsed.guildId !== expectedGuildId) {
        this.log.warn(
          `State file guild mismatch: found "${parsed.guildId}", expected "${expectedGuildId}". Discarding stale state.`,
        );
        return null;
      }

      if (parsed.anchorCategoryId !== expectedAnchorId) {
        this.log.warn(
          `State file anchor mismatch: found "${parsed.anchorCategoryId}", expected "${expectedAnchorId}". Discarding stale state.`,
        );
        return null;
      }

      return {
        categoryId: parsed.categoryId,
        rooms: parsed.rooms ?? {},
      };
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
   * Atomically writes Private JTC state to disk using a temporary file and rename.
   */
  public async saveState(
    guildId: string,
    anchorCategoryId: string,
    state: PrivateJtcState,
  ): Promise<void> {
    const release = await this.writeLock.acquire("private-state-file");
    try {
      const doc: PrivateJtcPersistentDocument = {
        version: 1,
        guildId,
        anchorCategoryId,
        categoryId: state.categoryId,
        rooms: state.rooms,
        updatedAt: new Date().toISOString(),
      };

      const dir = path.dirname(this.filePath);
      await fs.promises.mkdir(dir, { recursive: true });

      const tempFilePath = `${this.filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
      const serialized = JSON.stringify(doc, null, 2);

      await fs.promises.writeFile(tempFilePath, serialized, "utf-8");
      await fs.promises.rename(tempFilePath, this.filePath);

      this.log.debug(
        `Atomically saved Private JTC state to ${this.filePath}`,
      );
    } finally {
      release();
    }
  }

  /**
   * Clears the state file when all private rooms have been deleted.
   */
  public async clearState(): Promise<void> {
    const release = await this.writeLock.acquire("private-state-file");
    try {
      if (fs.existsSync(this.filePath)) {
        await fs.promises.unlink(this.filePath);
        this.log.debug(`Cleared state file at ${this.filePath}`);
      }
    } finally {
      release();
    }
  }
}
