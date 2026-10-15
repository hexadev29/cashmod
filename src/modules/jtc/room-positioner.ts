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
