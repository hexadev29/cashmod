import { describe, it, expect } from "vitest";
import {
  JtcOperationQueue,
  TaskPriority,
  TaskCancelledError,
  TaskTimeoutError,
} from "../../../src/modules/jtc/jtc-queue.js";

describe("JtcOperationQueue", () => {
  const defaultConfig = {
    concurrency: 1,
    minTaskDelayMs: 0,
    maxQueueSize: 50,
    taskTimeoutMs: 5000,
    enableEmptyRoomRecycling: true,
  };

  it("processes tasks in priority order (HIGH before LOW)", async () => {
    const queue = new JtcOperationQueue(defaultConfig);
    const executionOrder: string[] = [];

    // Queue LOW priority first
    const lowPromise = queue.enqueue(
      async () => {
        executionOrder.push("LOW");
        return "low-result";
      },
      TaskPriority.LOW,
    );

    // Queue NORMAL priority next
    const normalPromise = queue.enqueue(
      async () => {
        executionOrder.push("NORMAL");
        return "normal-result";
      },
      TaskPriority.NORMAL,
    );

    // Queue HIGH priority last
    const highPromise = queue.enqueue(
      async () => {
        executionOrder.push("HIGH");
        return "high-result";
      },
      TaskPriority.HIGH,
    );

    await Promise.all([lowPromise, normalPromise, highPromise]);

    // HIGH must run first, then NORMAL, then LOW
    expect(executionOrder).toEqual(["HIGH", "NORMAL", "LOW"]);
  });

  it("maintains FIFO order within the same priority tier", async () => {
    const queue = new JtcOperationQueue(defaultConfig);
    const executionOrder: number[] = [];

    const p1 = queue.enqueue(
      async () => {
        executionOrder.push(1);
      },
      TaskPriority.HIGH,
    );

    const p2 = queue.enqueue(
      async () => {
        executionOrder.push(2);
      },
      TaskPriority.HIGH,
    );

    const p3 = queue.enqueue(
      async () => {
        executionOrder.push(3);
      },
      TaskPriority.HIGH,
    );

    await Promise.all([p1, p2, p3]);

    expect(executionOrder).toEqual([1, 2, 3]);
  });

  it("cancels pending tasks by tag", async () => {
    const queue = new JtcOperationQueue(defaultConfig);
    const executionOrder: string[] = [];

    // High priority long running task to block queue
    const blocker = queue.enqueue(
      async () => {
        await new Promise((r) => setTimeout(r, 20));
        executionOrder.push("blocker");
      },
      TaskPriority.HIGH,
    );

    // Low priority cleanup task tagged for channel-123
    const cleanupPromise = queue.enqueue(
      async () => {
        executionOrder.push("cleanup-123");
      },
      TaskPriority.LOW,
      "cleanup:channel-123",
    );

    const cleanupAssertion = expect(cleanupPromise).rejects.toThrow(TaskCancelledError);

    // Cancel cleanup task while blocker is running
    const cancelledCount = queue.cancelByTag("cleanup:channel-123");
    expect(cancelledCount).toBe(1);

    await blocker;
    await cleanupAssertion;

    // Only blocker executed, cleanup was cancelled
    expect(executionOrder).toEqual(["blocker"]);
  });

  it("enforces pacing delay between tasks", async () => {
    const queue = new JtcOperationQueue({
      ...defaultConfig,
      minTaskDelayMs: 30,
    });

    const timestamps: number[] = [];
    const p1 = queue.enqueue(async () => {
      timestamps.push(Date.now());
    });
    const p2 = queue.enqueue(async () => {
      timestamps.push(Date.now());
    });

    await Promise.all([p1, p2]);

    const elapsed = timestamps[1] - timestamps[0];
    expect(elapsed).toBeGreaterThanOrEqual(25); // At least ~30ms spacing
  });

  it("handles task errors without deadlocking subsequent tasks", async () => {
    const queue = new JtcOperationQueue(defaultConfig);

    const failedPromise = queue.enqueue(async () => {
      throw new Error("Simulated API failure");
    });

    const successPromise = queue.enqueue(async () => {
      return "recovered";
    });

    await expect(failedPromise).rejects.toThrow("Simulated API failure");
    const result = await successPromise;
    expect(result).toBe("recovered");

    const stats = queue.getQueueStats();
    expect(stats.failed).toBe(1);
    expect(stats.completed).toBe(1);
  });

  it("times out tasks that exceed taskTimeoutMs", async () => {
    const queue = new JtcOperationQueue({
      ...defaultConfig,
      taskTimeoutMs: 25,
    });

    const hangPromise = queue.enqueue(async () => {
      // Hang indefinitely
      await new Promise(() => {});
    });

    await expect(hangPromise).rejects.toThrow(TaskTimeoutError);
  });
});
