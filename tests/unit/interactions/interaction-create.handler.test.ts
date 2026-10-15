import { describe, it, expect, vi, beforeEach } from "vitest";
import { interactionCreateHandler } from "../../../src/handlers/interactions/interaction-create.handler.js";
import * as privateJtcInstance from "../../../src/modules/private-jtc/private-jtc-instance.js";

describe("interactionCreateHandler (Thin Handler)", () => {
  let mockManager: any;
  let mockService: any;

  beforeEach(() => {
    mockManager = {
      isPrivateJtcInteraction: vi.fn(),
      handleInteraction: vi.fn().mockResolvedValue(undefined),
    };

    mockService = {
      getInteractionManager: vi.fn().mockReturnValue(mockManager),
    };

    vi.spyOn(privateJtcInstance, "getPrivateJtcService").mockReturnValue(mockService);
  });

  it("delegates to domain module manager when isPrivateJtcInteraction returns true", async () => {
    mockManager.isPrivateJtcInteraction.mockReturnValue(true);

    const mockInteraction = { customId: "pjtc:lock" } as any;
    await interactionCreateHandler.execute(mockInteraction);

    expect(mockManager.isPrivateJtcInteraction).toHaveBeenCalledWith(mockInteraction);
    expect(mockManager.handleInteraction).toHaveBeenCalledWith(mockInteraction);
  });

  it("skips delegation when isPrivateJtcInteraction returns false", async () => {
    mockManager.isPrivateJtcInteraction.mockReturnValue(false);

    const mockInteraction = { customId: "other:action" } as any;
    await interactionCreateHandler.execute(mockInteraction);

    expect(mockManager.isPrivateJtcInteraction).toHaveBeenCalledWith(mockInteraction);
    expect(mockManager.handleInteraction).not.toHaveBeenCalled();
  });

  it("does not crash when privateJtcService is not initialized", async () => {
    vi.spyOn(privateJtcInstance, "getPrivateJtcService").mockReturnValue(null);

    const mockInteraction = { customId: "pjtc:lock" } as any;
    await expect(interactionCreateHandler.execute(mockInteraction)).resolves.not.toThrow();
  });
});
