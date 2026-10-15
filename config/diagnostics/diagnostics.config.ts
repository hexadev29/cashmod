import type { LogLevel } from "../../src/diagnostics/logger.js";

export interface DiagnosticsConfig {
  logLevel: LogLevel;
  enableColors: boolean;
  debugMode: boolean;
  showBanner: boolean;
}

export const diagnosticsConfig: DiagnosticsConfig = {
  logLevel: (process.env.LOG_LEVEL as LogLevel) || "info",
  enableColors: process.env.NO_COLOR == null,
  debugMode: process.env.DEBUG_MODE === "true",
  showBanner: true,
};
