import { pathToFileURL } from "node:url";
import type { Client } from "discord.js";
import { discoverHandlerFiles } from "./discover-handlers.js";
import { validateHandler, HandlerValidationError } from "./validate-handler.js";
import type {
  EventHandler,
  HandlerResult,
  LoaderSummary,
} from "./loader-types.js";
import { logger } from "../../diagnostics/logger.js";

export interface RegisterHandlersOptions {
  handlersDir: string;
  failFastOnCritical?: boolean;
}

export const loadAndRegisterHandlers = async (
  client: Client,
  options: RegisterHandlersOptions,
): Promise<LoaderSummary> => {
  const { handlersDir, failFastOnCritical = false } = options;
  const log = logger.child({ subsystem: "HandlerLoader" });

  log.debug(`Starting handler discovery in directory: ${handlersDir}`);

  const files = await discoverHandlerFiles(handlersDir);
  const registeredNames = new Set<string>();
  const results: HandlerResult[] = [];

  let importedCount = 0;
  let validatedCount = 0;
  let registeredCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const filePath of files) {
    const startTime = performance.now();
    let currentStage: HandlerResult["stage"] = "discovered";

    try {
      // Stage 1: Import
      currentStage = "imported";
      const fileUrl = pathToFileURL(filePath).href;
      const importedModule = await import(fileUrl);
      importedCount++;

      // Stage 2: Validation & Duplicate Detection
      currentStage = "validated";
      const handler: EventHandler = validateHandler(
        importedModule,
        filePath,
        registeredNames,
      );
      validatedCount++;

      // Stage 3: Registration
      currentStage = "registered";
      const durationMs = Math.round(performance.now() - startTime);

      const executeWrapper = async (...args: any[]) => {
        try {
          await (handler.execute as (...a: any[]) => Promise<void> | void)(
            ...args,
          );
        } catch (execError: any) {
          logger
            .child({ subsystem: `Handler:${handler.name}` })
            .error(
              `Unhandled exception in handler "${handler.name}" for event "${handler.event}": ${execError?.message ?? execError}`,
              { event: handler.event, handler: handler.name },
              execError instanceof Error
                ? execError
                : new Error(String(execError)),
            );
        }
      };

      if (handler.once) {
        client.once(handler.event as any, executeWrapper);
      } else {
        client.on(handler.event as any, executeWrapper);
      }

      registeredNames.add(handler.name);
      registeredCount++;

      results.push({
        filePath,
        stage: "registered",
        name: handler.name,
        event: handler.event,
        durationMs,
      });

      log.debug(
        `Registered handler: "${handler.name}" for event "${handler.event}" (${durationMs}ms) [${filePath}]`,
      );
    } catch (err: any) {
      failedCount++;
      const durationMs = Math.round(performance.now() - startTime);
      const isValidationError = err instanceof HandlerValidationError;
      const errorObj = err instanceof Error ? err : new Error(String(err));

      results.push({
        filePath,
        stage: currentStage === "discovered" ? "imported" : currentStage,
        durationMs,
        error: errorObj,
      });

      log.error(
        `Failed to process handler at stage [${currentStage}]: ${errorObj.message} (${durationMs}ms) [${filePath}]`,
        { stage: currentStage, filePath, durationMs },
        errorObj,
      );

      if (failFastOnCritical && !isValidationError) {
        throw errorObj;
      }
    }
  }

  const summary: LoaderSummary = {
    discovered: files.length,
    imported: importedCount,
    validated: validatedCount,
    registered: registeredCount,
    skipped: skippedCount,
    failed: failedCount,
    results,
  };

  log.info(
    `Handler Loader summary: ${summary.registered} registered, ${summary.failed} failed out of ${summary.discovered} discovered`,
  );

  return summary;
};
