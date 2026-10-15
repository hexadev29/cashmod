import { theme } from "./console-theme.js";
import { redactObject, redactString } from "./redact-secrets.js";

export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

const LOG_SEVERITIES: Record<LogLevel, number> = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

export interface LogRecord {
  timestamp: string;
  level: LogLevel;
  subsystem?: string;
  message: string;
  context?: Record<string, unknown>;
  error?: Error;
}

export interface LoggerOptions {
  level?: LogLevel;
  subsystem?: string;
  sink?: (record: LogRecord, formatted: string) => void;
}

export class Logger {
  private level: LogLevel;
  private subsystem?: string;
  private sink: (record: LogRecord, formatted: string) => void;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? "info";
    this.subsystem = options.subsystem;
    this.sink = options.sink ?? this.defaultConsoleSink.bind(this);
  }

  public setLevel(level: LogLevel): void {
    this.level = level;
  }

  public getLevel(): LogLevel {
    return this.level;
  }

  public child(context: {
    subsystem?: string;
    [key: string]: unknown;
  }): Logger {
    const nextSubsystem = context.subsystem ?? this.subsystem;
    return new Logger({
      level: this.level,
      subsystem: nextSubsystem,
      sink: this.sink,
    });
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_SEVERITIES[level] <= LOG_SEVERITIES[this.level];
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: unknown,
  ): void {
    if (!this.shouldLog(level)) return;

    let errObj: Error | undefined;
    if (error instanceof Error) {
      errObj = redactObject(error);
    } else if (error != null) {
      errObj = new Error(redactString(String(error)));
    }

    const sanitizedContext = context ? redactObject(context) : undefined;
    const sanitizedMessage = redactString(message);

    const record: LogRecord = {
      timestamp: new Date().toISOString(),
      level,
      subsystem: this.subsystem,
      message: sanitizedMessage,
      context: sanitizedContext,
      error: errObj,
    };

    const formatted = this.formatRecord(record);
    this.sink(record, formatted);
  }

  public fatal(
    message: string,
    context?: Record<string, unknown>,
    error?: unknown,
  ): void {
    this.log("fatal", message, context, error);
  }

  public error(
    message: string,
    context?: Record<string, unknown>,
    error?: unknown,
  ): void {
    this.log("error", message, context, error);
  }

  public warn(
    message: string,
    context?: Record<string, unknown>,
    error?: unknown,
  ): void {
    this.log("warn", message, context, error);
  }

  public info(
    message: string,
    context?: Record<string, unknown>,
    error?: unknown,
  ): void {
    this.log("info", message, context, error);
  }

  public debug(
    message: string,
    context?: Record<string, unknown>,
    error?: unknown,
  ): void {
    this.log("debug", message, context, error);
  }

  public trace(
    message: string,
    context?: Record<string, unknown>,
    error?: unknown,
  ): void {
    this.log("trace", message, context, error);
  }

  private colorizeLevel(level: LogLevel): string {
    switch (level) {
      case "fatal":
        return theme.bold(theme.red("FATAL"));
      case "error":
        return theme.bold(theme.red("ERROR"));
      case "warn":
        return theme.bold(theme.yellow("WARN "));
      case "info":
        return theme.bold(theme.cyan("INFO "));
      case "debug":
        return theme.bold(theme.magenta("DEBUG"));
      case "trace":
        return theme.bold(theme.gray("TRACE"));
    }
  }

  private formatRecord(record: LogRecord): string {
    const time = theme.dim(record.timestamp.slice(11, 19));
    const lvl = this.colorizeLevel(record.level);
    const sub = record.subsystem ? theme.blue(`[${record.subsystem}]`) : "";

    let line = `${time} ${lvl} ${sub} ${record.message}`;

    if (record.context && Object.keys(record.context).length > 0) {
      line += `\n  ${theme.dim("context:")} ${JSON.stringify(record.context)}`;
    }

    if (record.error) {
      const stack = record.error.stack ?? record.error.message;
      line += `\n  ${theme.red("error:")} ${stack}`;
    }

    return line;
  }

  private defaultConsoleSink(record: LogRecord, formatted: string): void {
    if (record.level === "fatal" || record.level === "error") {
      console.error(formatted);
    } else if (record.level === "warn") {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  }
}

export const logger = new Logger();
