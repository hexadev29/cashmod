import { describe, it, expect, beforeEach } from "vitest";
import { Logger, type LogRecord } from "../../../src/diagnostics/logger.js";
import {
  registerSecret,
  clearSecrets,
  redactString,
  redactObject,
} from "../../../src/diagnostics/redact-secrets.js";

describe("redactSecrets", () => {
  beforeEach(() => {
    clearSecrets();
  });

  it("redacts explicit registered secrets from string", () => {
    registerSecret("super-secret-token-12345");
    const input = "Connected with token super-secret-token-12345 successfully";
    const output = redactString(input);
    expect(output).toBe("Connected with token [REDACTED_SECRET] successfully");
  });

  it("redacts Discord token patterns in string", () => {
    const fakeToken =
      "OTkxMjM0NTY3ODkwMTIzNDU2.GzXyZa.abcdefghijklmnopqrstuvwxyz1234567890";
    const input = `Error: Login failed with ${fakeToken}`;
    const output = redactString(input);
    expect(output).toContain("[REDACTED_TOKEN]");
    expect(output).not.toContain(fakeToken);
  });

  it("redacts sensitive keys in objects and errors", () => {
    const payload = {
      user: "alice",
      token: "secret123",
      nested: {
        authorization: "Bearer 999999",
        publicVal: "ok",
      },
    };

    const sanitized = redactObject(payload);
    expect(sanitized.token).toBe("[REDACTED]");
    expect(sanitized.nested.authorization).toBe("[REDACTED]");
    expect(sanitized.nested.publicVal).toBe("ok");
  });
});

describe("Logger", () => {
  it("respects log level filtering", () => {
    const records: LogRecord[] = [];
    const logger = new Logger({
      level: "warn",
      sink: (rec) => records.push(rec),
    });

    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");

    expect(records.map((r) => r.level)).toEqual(["warn", "error"]);
  });

  it("redacts registered secrets passed in log messages and context", () => {
    registerSecret("my-secret-credential");
    const records: LogRecord[] = [];
    const logger = new Logger({
      level: "info",
      sink: (rec) => records.push(rec),
    });

    logger.info("Connecting using my-secret-credential", {
      key: "my-secret-credential",
    });

    expect(records.length).toBe(1);
    expect(records[0].message).toContain("[REDACTED_SECRET]");
    expect((records[0].context as any).key).toContain("[REDACTED_SECRET]");
  });
});
