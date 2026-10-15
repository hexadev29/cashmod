import type { JtcCategoryName } from "../../../config/jtc/jtc.config.js";

/**
 * Finds the smallest positive integer (>= 1) not present in the given set/array.
 * Example: [1, 2, 3, 5] => 4
 * Example: [2, 3] => 1
 * Example: [] => 1
 */
export const findFirstMissingPositiveNumber = (
  numbers: Iterable<number>,
): number => {
  const present = new Set<number>();
  for (const n of numbers) {
    if (Number.isInteger(n) && n > 0) {
      present.add(n);
    }
  }

  let candidate = 1;
  while (present.has(candidate)) {
    candidate++;
  }
  return candidate;
};

/**
 * Parses channel names within a category to extract currently used room numbers.
 * Ignores channel names that do not match the expected category and naming regex.
 */
export const extractUsedRoomNumbers = (
  channelNames: Iterable<string>,
  categoryName: JtcCategoryName,
  namingRegex: RegExp,
): number[] => {
  const numbers: number[] = [];

  for (const name of channelNames) {
    const match = namingRegex.exec(name);
    if (!match) continue;

    const matchedCategory = match[1];
    const roomNumStr = match[2];

    if (
      matchedCategory.toLowerCase() === categoryName.toLowerCase() &&
      roomNumStr
    ) {
      const parsed = parseInt(roomNumStr, 10);
      if (!isNaN(parsed) && parsed > 0) {
        numbers.push(parsed);
      }
    }
  }

  return numbers;
};

/**
 * Simple asynchronous mutex lock to serialize operations per key (e.g. per category or per member).
 */
export class AsyncLock {
  private queues = new Map<string, Array<() => void>>();

  public async acquire(key: string): Promise<() => void> {
    if (!this.queues.has(key)) {
      this.queues.set(key, []);
      return () => this.release(key);
    }

    return new Promise<() => void>((resolve) => {
      const queue = this.queues.get(key)!;
      queue.push(() => resolve(() => this.release(key)));
    });
  }

  private release(key: string): void {
    const queue = this.queues.get(key);
    if (!queue || queue.length === 0) {
      this.queues.delete(key);
      return;
    }

    const next = queue.shift();
    if (next) {
      next();
    }
  }
}
