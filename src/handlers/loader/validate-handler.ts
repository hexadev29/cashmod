import type { EventHandler } from "./loader-types.js";

export class HandlerValidationError extends Error {
  constructor(
    public readonly filePath: string,
    message: string,
  ) {
    super(`Handler validation failed for "${filePath}": ${message}`);
    this.name = "HandlerValidationError";
  }
}

export const extractHandler = (moduleExports: any): EventHandler | null => {
  if (!moduleExports) return null;
  if (isHandlerShape(moduleExports.default)) {
    return moduleExports.default;
  }
  if (isHandlerShape(moduleExports.handler)) {
    return moduleExports.handler;
  }
  if (isHandlerShape(moduleExports)) {
    return moduleExports;
  }
  return null;
};

const isHandlerShape = (candidate: any): candidate is EventHandler => {
  return (
    candidate != null &&
    typeof candidate === "object" &&
    typeof candidate.name === "string" &&
    candidate.name.trim().length > 0 &&
    typeof candidate.event === "string" &&
    candidate.event.trim().length > 0 &&
    typeof candidate.execute === "function"
  );
};

export const validateHandler = (
  candidateModule: any,
  filePath: string,
  registeredNames: Set<string>,
): EventHandler => {
  const handler = extractHandler(candidateModule);

  if (!handler) {
    throw new HandlerValidationError(
      filePath,
      'Module must export a valid EventHandler (with non-empty string "name", non-empty string "event", and "execute" function) via default or named export.',
    );
  }

  if (registeredNames.has(handler.name)) {
    throw new HandlerValidationError(
      filePath,
      `Duplicate handler identity detected: "${handler.name}". Another handler already registered with this name.`,
    );
  }

  return handler;
};
