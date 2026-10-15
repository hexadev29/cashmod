import { describe, it, expect } from "vitest";
import {
  calculateTargetPosition,
  type SiblingChannelInfo,
} from "../../../src/modules/jtc/room-positioner.js";

describe("calculateTargetPosition", () => {
  it("returns 0 when there are no siblings", () => {
    expect(calculateTargetPosition([], 1)).toBe(0);
  });

  it("inserts room at beginning before smaller siblings", () => {
    const siblings: SiblingChannelInfo[] = [
      { id: "c2", roomNumber: 2, position: 10 },
      { id: "c3", roomNumber: 3, position: 11 },
    ];
    // Room 1 should take position 10 (at or before room 2)
    expect(calculateTargetPosition(siblings, 1)).toBe(10);
  });

  it("inserts room between existing siblings (e.g. inserting 4 between 3 and 5)", () => {
    const siblings: SiblingChannelInfo[] = [
      { id: "c1", roomNumber: 1, position: 5 },
      { id: "c2", roomNumber: 2, position: 6 },
      { id: "c3", roomNumber: 3, position: 7 },
      { id: "c5", roomNumber: 5, position: 8 },
    ];
    // Room 4 should be placed at the position of room 5 (position 8)
    expect(calculateTargetPosition(siblings, 4)).toBe(8);
  });

  it("appends room after highest sibling when room is greatest", () => {
    const siblings: SiblingChannelInfo[] = [
      { id: "c1", roomNumber: 1, position: 5 },
      { id: "c2", roomNumber: 2, position: 6 },
      { id: "c3", roomNumber: 3, position: 7 },
    ];
    // Room 4 should be placed at lastSibling.position + 1 (7 + 1 = 8)
    expect(calculateTargetPosition(siblings, 4)).toBe(8);
  });
});
