import { describe, it, expect } from "vitest";
import {
  findFirstMissingPositiveNumber,
  extractUsedRoomNumbers,
  AsyncLock,
} from "../../../src/modules/jtc/room-allocator.js";

describe("findFirstMissingPositiveNumber", () => {
  it("allocates 1 when no rooms exist", () => {
    expect(findFirstMissingPositiveNumber([])).toBe(1);
  });

  it("allocates 4 when rooms 1, 2, 3, and 5 exist (prompt requirement)", () => {
    expect(findFirstMissingPositiveNumber([1, 2, 3, 5])).toBe(4);
  });

  it("allocates 1 when existing rooms start at 2", () => {
    expect(findFirstMissingPositiveNumber([2, 3, 4])).toBe(1);
  });

  it("allocates 4 when sequential rooms 1, 2, 3 exist", () => {
    expect(findFirstMissingPositiveNumber([1, 2, 3])).toBe(4);
  });

  it("allocates 2 when rooms 1, 3, 4 exist", () => {
    expect(findFirstMissingPositiveNumber([1, 3, 4])).toBe(2);
  });

  it("ignores negative numbers and zeros", () => {
    expect(findFirstMissingPositiveNumber([-2, -1, 0, 1, 2])).toBe(3);
  });
});

describe("extractUsedRoomNumbers", () => {
  const namingRegex = /^(Solo|Duo|Trio|Quad|Penta|Hexa|Septa|Octa)\s+#(\d+)$/i;

  it("extracts numbers for the matching category", () => {
    const names = ["Solo #1", "Solo #2", "Solo #5"];
    const extracted = extractUsedRoomNumbers(names, "Solo", namingRegex);
    expect(extracted).toEqual([1, 2, 5]);
  });

  it("ignores rooms from other categories", () => {
    const names = ["Solo #1", "Duo #2", "Trio #3"];
    const extractedSolo = extractUsedRoomNumbers(names, "Solo", namingRegex);
    const extractedDuo = extractUsedRoomNumbers(names, "Duo", namingRegex);
    expect(extractedSolo).toEqual([1]);
    expect(extractedDuo).toEqual([2]);
  });

  it("ignores unrelated channel names", () => {
    const names = [
      "general",
      "gaming-room",
      "Solo Talk",
      "Solo ##2",
      "Solo #abc",
    ];
    const extracted = extractUsedRoomNumbers(names, "Solo", namingRegex);
    expect(extracted).toEqual([]);
  });
});

describe("AsyncLock", () => {
  it("serializes concurrent tasks in order", async () => {
    const lock = new AsyncLock();
    const executionOrder: number[] = [];

    const task = async (id: number, delayMs: number) => {
      const release = await lock.acquire("test-lock");
      try {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        executionOrder.push(id);
      } finally {
        release();
      }
    };

    // Launch tasks concurrently
    await Promise.all([task(1, 30), task(2, 20), task(3, 10)]);

    // Even though task 2 & 3 had shorter delays, they must execute sequentially: 1, 2, 3
    expect(executionOrder).toEqual([1, 2, 3]);
  });
});
