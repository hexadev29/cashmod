import { describe, it, expect, vi } from "vitest";
import path from "node:path";
import {
  isApprovedHandlerFile,
  discoverHandlerFiles,
} from "../../../src/handlers/loader/discover-handlers.js";
import {
  validateHandler,
  HandlerValidationError,
} from "../../../src/handlers/loader/validate-handler.js";
import { loadAndRegisterHandlers } from "../../../src/handlers/loader/register-handlers.js";
import type { Client } from "discord.js";

describe("Handler Discovery Exclusions", () => {
  it("approves legitimate handler files", () => {
    expect(
      isApprovedHandlerFile("src/handlers/voice/voice-state-update.handler.ts"),
    ).toBe(true);
    expect(
      isApprovedHandlerFile(
        "dist/src/handlers/voice/voice-state-update.handler.js",
      ),
    ).toBe(true);
    expect(isApprovedHandlerFile("src/handlers/ready.handler.mjs")).toBe(true);
  });

  it("excludes tests, type declarations, source maps, and config files", () => {
    expect(
      isApprovedHandlerFile("tests/unit/handler-loader/loader.test.ts"),
    ).toBe(false);
    expect(
      isApprovedHandlerFile(
        "src/handlers/voice/voice-state-update.handler.d.ts",
      ),
    ).toBe(false);
    expect(
      isApprovedHandlerFile(
        "src/handlers/voice/voice-state-update.handler.js.map",
      ),
    ).toBe(false);
    expect(isApprovedHandlerFile("src/handlers/loader/loader-types.ts")).toBe(
      false,
    );
    expect(
      isApprovedHandlerFile("src/handlers/fixtures/dummy.handler.ts"),
    ).toBe(false);
    expect(isApprovedHandlerFile("config/discord/discord.config.ts")).toBe(
      false,
    );
  });

  it("discovers handlers across actual repository paths (dev and dist)", async () => {
    const devHandlers = await discoverHandlerFiles(
      path.resolve(process.cwd(), "src/handlers"),
    );
    expect(devHandlers.length).toBeGreaterThanOrEqual(1);
    expect(
      devHandlers.some((f) => f.endsWith("voice-state-update.handler.ts")),
    ).toBe(true);

    const distHandlers = await discoverHandlerFiles(
      path.resolve(process.cwd(), "dist/src/handlers"),
    );
    expect(distHandlers.length).toBeGreaterThanOrEqual(1);
    expect(
      distHandlers.some((f) => f.endsWith("voice-state-update.handler.js")),
    ).toBe(true);
  });
});

describe("validateHandler", () => {
  it("successfully validates a conforming handler export", () => {
    const validModule = {
      default: {
        name: "testHandler",
        event: "ready",
        execute: async () => {},
      },
    };

    const registered = new Set<string>();
    const handler = validateHandler(validModule, "/mock/path.ts", registered);
    expect(handler.name).toBe("testHandler");
    expect(handler.event).toBe("ready");
  });

  it("rejects an export missing the execute function", () => {
    const invalidModule = {
      default: {
        name: "testHandler",
        event: "ready",
      },
    };

    const registered = new Set<string>();
    expect(() =>
      validateHandler(invalidModule, "/mock/path.ts", registered),
    ).toThrow(HandlerValidationError);
  });

  it("rejects an export with empty handler name", () => {
    const invalidModule = {
      default: {
        name: "   ",
        event: "ready",
        execute: async () => {},
      },
    };

    const registered = new Set<string>();
    expect(() =>
      validateHandler(invalidModule, "/mock/path.ts", registered),
    ).toThrow(HandlerValidationError);
  });

  it("detects duplicate handler identities", () => {
    const module1 = {
      default: {
        name: "duplicateName",
        event: "ready",
        execute: async () => {},
      },
    };

    const registered = new Set<string>(["duplicateName"]);
    expect(() =>
      validateHandler(module1, "/mock/path2.ts", registered),
    ).toThrow(/Duplicate handler identity detected/);
  });
});

describe("loadAndRegisterHandlers", () => {
  it("registers discovered handlers on client and handles execution errors safely", async () => {
    const eventListeners: Record<string, Function> = {};
    const mockClient = {
      on: vi.fn().mockImplementation((event: string, fn: Function) => {
        eventListeners[event] = fn;
      }),
      once: vi.fn(),
    } as unknown as Client;

    const summary = await loadAndRegisterHandlers(mockClient, {
      handlersDir: path.resolve(process.cwd(), "src/handlers"),
    });

    expect(summary.discovered).toBeGreaterThanOrEqual(1);
    expect(summary.registered).toBeGreaterThanOrEqual(1);
    expect(summary.failed).toBe(0);
    expect(mockClient.on).toHaveBeenCalled();

    // Verify wrapped execution handles unexpected exceptions without throwing unhandled rejection
    const voiceListener = eventListeners["voiceStateUpdate"];
    expect(voiceListener).toBeDefined();

    // Calling listener with invalid arguments won't crash process because of error boundary
    await expect(voiceListener(null, null)).resolves.not.toThrow();
  });
});
