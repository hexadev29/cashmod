import { describe, it, expect } from "vitest";
import {
  calculateTargetPosition,
  calculateCategoryTargetPosition,
  type SiblingChannelInfo,
  type ExistingCategoryInfo,
} from "../../../src/modules/jtc/room-positioner.js";
import { JTC_CATEGORY_ORDER } from "../../../config/jtc/jtc.config.js";

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

describe("calculateCategoryTargetPosition", () => {
  const anchorPos = 2;

  it("places initial category directly below anchor regardless of categoryOrder index", () => {
    // When no dynamic categories exist yet, even Quad should be created directly below anchor (anchorPos + 1)
    expect(
      calculateCategoryTargetPosition("Quad", JTC_CATEGORY_ORDER, [], anchorPos),
    ).toBe(3);

    expect(
      calculateCategoryTargetPosition("Solo", JTC_CATEGORY_ORDER, [], anchorPos),
    ).toBe(3);
  });

  it("places Duo under Solo when Solo exists", () => {
    const existing: ExistingCategoryInfo[] = [{ name: "Solo", position: 3 }];
    // Duo comes after Solo in category order, so it goes after Solo (3 + 1 = 4)
    expect(
      calculateCategoryTargetPosition("Duo", JTC_CATEGORY_ORDER, existing, anchorPos),
    ).toBe(4);
  });

  it("places Solo above Trio when Trio exists and Solo does not", () => {
    const existing: ExistingCategoryInfo[] = [{ name: "Trio", position: 3 }];
    // Solo comes before Trio in category order, so it takes Trio's position (3), pushing Trio down
    expect(
      calculateCategoryTargetPosition("Solo", JTC_CATEGORY_ORDER, existing, anchorPos),
    ).toBe(3);
  });

  it("places Duo under Solo and above Trio when Solo and Trio exist", () => {
    const existing: ExistingCategoryInfo[] = [
      { name: "Solo", position: 3 },
      { name: "Trio", position: 4 },
    ];
    // Duo comes before Trio, so it takes Trio's position (4), pushing Trio to 5
    expect(
      calculateCategoryTargetPosition("Duo", JTC_CATEGORY_ORDER, existing, anchorPos),
    ).toBe(4);
  });

  it("places Quad under Solo and Duo when only Solo and Duo exist", () => {
    const existing: ExistingCategoryInfo[] = [
      { name: "Solo", position: 3 },
      { name: "Duo", position: 4 },
    ];
    // Quad comes after Duo, so it goes after Duo (4 + 1 = 5)
    expect(
      calculateCategoryTargetPosition("Quad", JTC_CATEGORY_ORDER, existing, anchorPos),
    ).toBe(5);
  });

  it("places Trio between Duo and Quad", () => {
    const existing: ExistingCategoryInfo[] = [
      { name: "Solo", position: 3 },
      { name: "Duo", position: 4 },
      { name: "Quad", position: 5 },
    ];
    // Trio comes before Quad, so it takes Quad's position (5), pushing Quad to 6
    expect(
      calculateCategoryTargetPosition("Trio", JTC_CATEGORY_ORDER, existing, anchorPos),
    ).toBe(5);
  });
});

