import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { JtcStateStore } from "../../../src/modules/jtc/jtc-state-store.js";

describe("JtcStateStore", () => {
  const testDir = path.resolve(process.cwd(), "data/test-state");
  const testFilePath = path.join(testDir, "jtc-categories.json");
  let store: JtcStateStore;

  const testGuildId = "123456789012345678";
  const testAnchorId = "123456789012345679";

  beforeEach(async () => {
    store = new JtcStateStore(testFilePath);
    if (fs.existsSync(testDir)) {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    if (fs.existsSync(testDir)) {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }
  });

  it("returns null on fresh installation when state file does not exist", async () => {
    const loaded = await store.loadState(testGuildId, testAnchorId);
    expect(loaded).toBeNull();
  });

  it("atomically saves and reloads category mapping", async () => {
    const mapping = {
      Solo: "900000000000000001",
      Duo: "900000000000000002",
    };

    await store.saveState(testGuildId, testAnchorId, mapping);
    expect(fs.existsSync(testFilePath)).toBe(true);

    const loaded = await store.loadState(testGuildId, testAnchorId);
    expect(loaded).toEqual(mapping);
  });

  it("discards state if guildId does not match", async () => {
    const mapping = { Solo: "900000000000000001" };
    await store.saveState("different-guild-id", testAnchorId, mapping);

    const loaded = await store.loadState(testGuildId, testAnchorId);
    expect(loaded).toBeNull();
  });

  it("discards state if anchorCategoryId does not match", async () => {
    const mapping = { Solo: "900000000000000001" };
    await store.saveState(testGuildId, "different-anchor-id", mapping);

    const loaded = await store.loadState(testGuildId, testAnchorId);
    expect(loaded).toBeNull();
  });

  it("handles malformed JSON file safely", async () => {
    await fs.promises.mkdir(testDir, { recursive: true });
    await fs.promises.writeFile(
      testFilePath,
      "{ invalid json content ...",
      "utf-8",
    );

    const loaded = await store.loadState(testGuildId, testAnchorId);
    expect(loaded).toBeNull();
  });

  it("refuses to save an empty mapping", async () => {
    await expect(
      store.saveState(testGuildId, testAnchorId, {}),
    ).rejects.toThrow("Refusing to persist empty categories mapping");
  });
});
