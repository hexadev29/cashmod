export interface SiblingChannelInfo {
  id: string;
  roomNumber: number;
  position: number;
}

/**
 * Calculates the target position for a new room within its category siblings.
 * Rooms are ordered by their room number ascending.
 */
export const calculateTargetPosition = (
  siblings: readonly SiblingChannelInfo[],
  newRoomNumber: number,
): number | undefined => {
  if (siblings.length === 0) {
    return 0;
  }

  // Sort siblings by room number ascending
  const sorted = [...siblings].sort((a, b) => a.roomNumber - b.roomNumber);

  // Find the first sibling that has a roomNumber > newRoomNumber
  const nextSibling = sorted.find((s) => s.roomNumber > newRoomNumber);

  if (nextSibling) {
    // Should be positioned at or before this sibling's position
    return nextSibling.position;
  }

  // Otherwise, place it after the highest sibling
  const lastSibling = sorted[sorted.length - 1];
  return lastSibling.position + 1;
};

export interface ExistingCategoryInfo {
  name: string;
  position: number;
}

/**
 * Calculates the target position for a dynamic JTC category.
 *
 * Requirements:
 * 1. Category order is: Solo → Duo → Trio → Quad → Penta → Hepta → Septa → Octa.
 * 2. If no dynamic JTC categories exist, place immediately below the anchor category (anchorPosition + 1).
 * 3. If dynamic categories exist:
 *    - Find the first existing category that appears AFTER targetCategory in categoryOrder.
 *      If one exists, place the new category at that category's position (inserting above it).
 *    - Otherwise, place immediately after the last existing category that appears BEFORE targetCategory.
 */
export const calculateCategoryTargetPosition = (
  targetCategory: string,
  categoryOrder: readonly string[],
  existingCategories: readonly ExistingCategoryInfo[],
  anchorPosition: number,
): number => {
  const targetIndex = categoryOrder.indexOf(targetCategory);
  if (targetIndex === -1) {
    return anchorPosition + 1;
  }

  // Filter out any matching targetCategory just in case, and sort by categoryOrder
  const sortedExisting = existingCategories
    .filter((c) => c.name !== targetCategory && categoryOrder.includes(c.name))
    .slice()
    .sort((a, b) => categoryOrder.indexOf(a.name) - categoryOrder.indexOf(b.name));

  if (sortedExisting.length === 0) {
    return anchorPosition + 1;
  }

  // Find the first existing category that comes AFTER targetCategory in categoryOrder
  const nextCategory = sortedExisting.find(
    (c) => categoryOrder.indexOf(c.name) > targetIndex,
  );

  if (nextCategory) {
    // Positioning at nextCategory.position places targetCategory immediately above nextCategory
    return nextCategory.position;
  }

  // Otherwise, place immediately after the last existing category that comes before targetCategory
  const lastBefore = sortedExisting[sortedExisting.length - 1];
  return lastBefore.position + 1;
};

