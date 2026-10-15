/**
 * Secret redaction utility to prevent Discord tokens, API keys, and sensitive environment
 * variables from leaking into terminal output or log records.
 */

const knownSecrets = new Set<string>();

const SENSITIVE_KEY_REGEX =
  /^(token|authorization|secret|password|api[-_]?key|bot[-_]?token)$/i;
const DISCORD_TOKEN_REGEX = /[\w-]{24,28}\.[\w-]{6}\.[\w-]{27,45}/g;

export const registerSecret = (secret: string | undefined): void => {
  if (secret && secret.trim().length > 6) {
    knownSecrets.add(secret.trim());
  }
};

export const clearSecrets = (): void => {
  knownSecrets.clear();
};

export const redactString = (value: string): string => {
  let result = value;

  // Redact registered explicit secrets
  for (const secret of knownSecrets) {
    if (secret && result.includes(secret)) {
      result = result.replaceAll(secret, "[REDACTED_SECRET]");
    }
  }

  // Redact pattern-matched Discord tokens
  result = result.replace(DISCORD_TOKEN_REGEX, "[REDACTED_TOKEN]");

  return result;
};

export const redactObject = <T>(target: T, depth = 0): T => {
  if (depth > 6 || target == null || typeof target !== "object") {
    if (typeof target === "string") {
      return redactString(target) as unknown as T;
    }
    return target;
  }

  if (target instanceof Error) {
    const errorCopy = new Error(redactString(target.message));
    errorCopy.name = target.name;
    if (target.stack) {
      errorCopy.stack = redactString(target.stack);
    }
    return errorCopy as unknown as T;
  }

  if (Array.isArray(target)) {
    return target.map((item) => redactObject(item, depth + 1)) as unknown as T;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(target)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof val === "string") {
      sanitized[key] = redactString(val);
    } else if (typeof val === "object" && val !== null) {
      sanitized[key] = redactObject(val, depth + 1);
    } else {
      sanitized[key] = val;
    }
  }

  return sanitized as T;
};
