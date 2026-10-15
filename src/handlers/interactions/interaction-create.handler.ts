import type { Interaction } from "discord.js";
import type { EventHandler } from "../loader/loader-types.js";
import { getPrivateJtcService } from "../../modules/private-jtc/private-jtc-instance.js";
import { logger } from "../../diagnostics/logger.js";

const log = logger.child({ subsystem: "InteractionCreateHandler" });

/**
 * Thin event handler for interactionCreate.
 * Delegates all domain-specific interaction handling to the respective feature modules.
 */
export const interactionCreateHandler: EventHandler<"interactionCreate"> = {
  name: "interactionCreate",
  event: "interactionCreate",
  execute: async (interaction: Interaction) => {
    try {
      const privateJtcService = getPrivateJtcService();
      if (!privateJtcService) {
        return;
      }

      const manager = privateJtcService.getInteractionManager();
      if (manager && manager.isPrivateJtcInteraction(interaction)) {
        await manager.handleInteraction(interaction);
      }
    } catch (err: any) {
      log.error(
        `Error executing interactionCreateHandler: ${err?.message}`,
        undefined,
        err,
      );
    }
  },
};

export default interactionCreateHandler;
