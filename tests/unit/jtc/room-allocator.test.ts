import { describe, it, expect } from "vitest";
import {
  findFirstMissingPositiveNumber,
  extractUsedRoomNumbers,
  findEmptyRoomsAscending,
  selectBestEmptyRoomToRecycle,
  type ExistingRoomInfo,
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
  const namingRegex = /^(Solo|Duo|Trio|Quad|Penta|Hepta|Septa|Octa)\s+#(\d+)$/i;

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

describe("Empty room recycling (selectBestEmptyRoomToRecycle)", () => {
  it("prioritizes the lowest room number in ascending order when multiple empty rooms exist", () => {
    // Exact user requirement: if solo 3, 6, 7 are empty then 3 should be prioritized and moved to it
    const rooms: ExistingRoomInfo[] = [
      { id: "ch-7", roomNumber: 7, memberCount: 0 },
      { id: "ch-3", roomNumber: 3, memberCount: 0 },
      { id: "ch-6", roomNumber: 6, memberCount: 0 },
    ];

    const best = selectBestEmptyRoomToRecycle(rooms);
    expect(best).not.toBeNull();
    expect(best?.roomNumber).toBe(3);
    expect(best?.id).toBe("ch-3");

    const allSorted = findEmptyRoomsAscending(rooms);
    expect(allSorted.map((r) => r.roomNumber)).toEqual([3, 6, 7]);
  });

  it("ignores rooms that have active members", () => {
    const rooms: ExistingRoomInfo[] = [
      { id: "ch-1", roomNumber: 1, memberCount: 2 }, // occupied
      { id: "ch-2", roomNumber: 2, memberCount: 1 }, // occupied
      { id: "ch-4", roomNumber: 4, memberCount: 0 }, // empty
      { id: "ch-5", roomNumber: 5, memberCount: 0 }, // empty
    ];

    const best = selectBestEmptyRoomToRecycle(rooms);
    expect(best?.roomNumber).toBe(4);
  });

  it("returns null when no empty rooms exist", () => {
    const rooms: ExistingRoomInfo[] = [
      { id: "ch-1", roomNumber: 1, memberCount: 1 },
      { id: "ch-2", roomNumber: 2, memberCount: 1 },
    ];
    expect(selectBestEmptyRoomToRecycle(rooms)).toBeNull();
    expect(selectBestEmptyRoomToRecycle([])).toBeNull();
  });

  it("excludes reserved channel IDs when selecting empty rooms", () => {
    const rooms: ExistingRoomInfo[] = [
      { id: "ch-3", roomNumber: 3, memberCount: 0 },
      { id: "ch-6", roomNumber: 6, memberCount: 0 },
      { id: "ch-7", roomNumber: 7, memberCount: 0 },
    ];

    // Room 3 is currently reserved by an in-flight operation
    const reserved = new Set(["ch-3"]);
    const best = selectBestEmptyRoomToRecycle(rooms, reserved);

    // Should skip room 3 and select room 6
    expect(best).not.toBeNull();
    expect(best?.roomNumber).toBe(6);
    expect(best?.id).toBe("ch-6");
  });
});


