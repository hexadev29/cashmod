import { logger } from "../../diagnostics/logger.js";
import type { JtcQueueConfig } from "../../../config/jtc/jtc.config.js";

export enum TaskPriority {
  HIGH = 0, // Voice joins, room allocations, member moves
  NORMAL = 1, // Category realignments, state persistence
  LOW = 2, // Voice leaves, room cleanups, category deletions
}

export class TaskCancelledError extends Error {
  constructor(message = "Task was cancelled in queue") {
    super(message);
    this.name = "TaskCancelledError";
  }
}

export class TaskTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Task exceeded timeout limit of ${timeoutMs}ms`);
    this.name = "TaskTimeoutError";
  }
}

interface QueuedItem<T = any> {
  id: string;
  tag?: string;
  priority: TaskPriority;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
  enqueuedAt: number;
  cancelled?: boolean;
}

export interface QueueStats {
  pending: number;
  active: number;
  completed: number;
  failed: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class JtcOperationQueue {
  private readonly pending: QueuedItem[] = [];
  private activeCount = 0;
  private completedCount = 0;
  private failedCount = 0;
  private taskCounter = 0;
  private isProcessing = false;
  private readonly log = logger.child({ subsystem: "JtcQueue" });

  constructor(private readonly config: JtcQueueConfig) {}

  public getQueueStats(): QueueStats {
    return {
      pending: this.pending.length,
      active: this.activeCount,
      completed: this.completedCount,
      failed: this.failedCount,
    };
  }

  /**
   * Enqueues an asynchronous operation with a given priority and optional cancellation tag.
   */
  public enqueue<T>(
    operation: () => Promise<T>,
    priority: TaskPriority = TaskPriority.NORMAL,
    tag?: string,
  ): Promise<T> {
    if (this.pending.length >= this.config.maxQueueSize) {
      throw new Error(
        `JtcOperationQueue overflow: pending tasks (${this.pending.length}) exceeded limit of ${this.config.maxQueueSize}`,
      );
    }

    this.taskCounter++;
    const taskId = `task-${this.taskCounter}`;

    return new Promise<T>((resolve, reject) => {
      const item: QueuedItem<T> = {
        id: taskId,
        tag,
        priority,
        execute: operation,
        resolve,
        reject,
        enqueuedAt: Date.now(),
      };

      // Insert keeping items sorted by priority ascending (HIGH=0, NORMAL=1, LOW=2)
      // Within the same priority, maintain FIFO order
      const insertIndex = this.findInsertionIndex(priority);
      this.pending.splice(insertIndex, 0, item);

      this.log.debug(`Enqueued ${taskId} [priority=${TaskPriority[priority]}]${tag ? ` (tag=${tag})` : ""}; pending=${this.pending.length}`);

      this.scheduleProcessing();
    });
  }

  /**
   * Cancels all pending tasks matching the given tag.
   * Useful when an empty room is recycled and its pending cleanup must be discarded.
   * Returns the count of cancelled tasks.
   */
  public cancelByTag(tag: string): number {
    let cancelledCount = 0;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const item = this.pending[i];
      if (item.tag === tag) {
        item.cancelled = true;
        this.pending.splice(i, 1);
        cancelledCount++;
        this.log.debug(`Cancelled pending queue task ${item.id} with tag "${tag}"`);
        item.reject(new TaskCancelledError(`Task with tag "${tag}" was cancelled`));
      }
    }
    return cancelledCount;
  }

  /**
   * Clears all pending tasks.
   */
  public clear(): void {
    while (this.pending.length > 0) {
      const item = this.pending.shift();
      if (item) {
        item.cancelled = true;
        item.reject(new TaskCancelledError("Queue was cleared"));
      }
    }
  }

  private findInsertionIndex(priority: TaskPriority): number {
    // Find first item that has higher numeric priority (i.e. lower precedence)
    for (let i = 0; i < this.pending.length; i++) {
      if (this.pending[i].priority > priority) {
        return i;
      }
    }
    return this.pending.length;
  }

  private scheduleProcessing(): void {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;
    queueMicrotask(() => this.processNext());
  }

  private async processNext(): Promise<void> {
    while (
      this.pending.length > 0 &&
      this.activeCount < this.config.concurrency
    ) {
      const nextItem = this.pending.shift();
      if (!nextItem) break;

      if (nextItem.cancelled) {
        continue;
      }

      this.activeCount++;
      this.runTask(nextItem).finally(() => {
        this.activeCount--;
        // Pacing delay between completed tasks to avoid hitting Discord burst limits
        if (this.config.minTaskDelayMs > 0) {
          sleep(this.config.minTaskDelayMs).then(() => {
            this.processNext();
          });
        } else {
          this.processNext();
        }
      });
    }

    if (this.pending.length === 0 && this.activeCount === 0) {
      this.isProcessing = false;
    }
  }

  private async runTask(item: QueuedItem): Promise<void> {
    const queueWaitMs = Date.now() - item.enqueuedAt;
    this.log.debug(`Executing ${item.id} [priority=${TaskPriority[item.priority]}] (queued for ${queueWaitMs}ms)`);

    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      if (this.config.taskTimeoutMs > 0) {
        timer = setTimeout(() => {
          reject(new TaskTimeoutError(this.config.taskTimeoutMs));
        }, this.config.taskTimeoutMs);
      }
    });

    try {
      const result = await Promise.race([item.execute(), timeoutPromise]);
      this.completedCount++;
      item.resolve(result);
    } catch (err: any) {
      this.failedCount++;
      this.log.error(`Queue task ${item.id} failed: ${err?.message}`, { taskId: item.id }, err);
      item.reject(err);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
