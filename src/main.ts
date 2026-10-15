import "dotenv/config";
import { startBot } from "./bot/start-bot.js";
import { logger } from "./diagnostics/logger.js";

process.on("unhandledRejection", (reason: any) => {
  logger.fatal(
    "Unhandled Promise Rejection caught at process level",
    undefined,
    reason,
  );
});

process.on("uncaughtException", (error: Error) => {
  logger.fatal("Uncaught Exception caught at process level", undefined, error);
  process.exit(1);
});

startBot().catch((err: any) => {
  logger.fatal(`Fatal startup error: ${err?.message ?? err}`, undefined, err);
  process.exit(1);
});
