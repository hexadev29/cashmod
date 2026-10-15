import type { ClientEvents } from "discord.js";

export type HandlerStage =
  "discovered" | "imported" | "validated" | "registered" | "skipped" | "failed";

export interface EventHandler<
  K extends keyof ClientEvents = keyof ClientEvents,
> {
  name: string;
  event: K;
  once?: boolean;
  execute: (...args: ClientEvents[K]) => Promise<void> | void;
}

export interface HandlerResult {
  filePath: string;
  stage: HandlerStage;
  name?: string;
  event?: string;
  durationMs?: number;
  error?: Error;
  reason?: string;
}

export interface LoaderSummary {
  discovered: number;
  imported: number;
  validated: number;
  registered: number;
  skipped: number;
  failed: number;
  results: HandlerResult[];
}
