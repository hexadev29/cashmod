import type { AppConfig } from "./config-types.js";
import {
  JTC_CATEGORY_ORDER,
  type JtcCategoryName,
  type JtcTriggerConfig,
  type JtcCategoryConfig,
} from "../../../config/jtc/jtc.config.js";

export interface ValidationError {
  field: string;
  message: string;
}

export class ConfigValidationError extends Error {
  public readonly errors: readonly ValidationError[];

  constructor(errors: ValidationError[]) {
    const summary = errors
      .map((e) => ` - [${e.field}]: ${e.message}`)
      .join("\n");
    super(`Configuration Validation Failed:\n${summary}`);
    this.name = "ConfigValidationError";
    this.errors = Object.freeze([...errors]);
  }
}

const SNOWFLAKE_REGEX = /^\d{17,20}$/;

export const isSnowflake = (value: unknown): value is string => {
  return typeof value === "string" && SNOWFLAKE_REGEX.test(value);
};

export const validateConfig = (config: AppConfig): void => {
  const errors: ValidationError[] = [];

  // 1. Environment & Token Validation
  if (
    !config.env.token ||
    typeof config.env.token !== "string" ||
    config.env.token.trim().length === 0
  ) {
    errors.push({
      field: "env.token",
      message:
        "DISCORD_TOKEN environment variable is required and cannot be empty.",
    });
  }

  // 2. Discord Config Validation
  if (!config.discord.guildId || !isSnowflake(config.discord.guildId)) {
    errors.push({
      field: "discord.guildId",
      message: `guildId must be a valid 17-20 digit Discord snowflake string, received: "${config.discord.guildId}".`,
    });
  }

  // 3. Permissions Policy Validation
  if (!config.permissions.policies.everyone) {
    errors.push({
      field: "permissions.policies.everyone",
      message: 'Missing "everyone" policy in global permissions configuration.',
    });
  }
  if (!config.permissions.policies.roomOwner) {
    errors.push({
      field: "permissions.policies.roomOwner",
      message:
        'Missing "roomOwner" policy in global permissions configuration.',
    });
  }

  // 4. JTC Category Order Validation
  const expectedOrder: readonly JtcCategoryName[] = JTC_CATEGORY_ORDER;
  if (
    !config.jtc.categoryOrder ||
    config.jtc.categoryOrder.length !== expectedOrder.length
  ) {
    errors.push({
      field: "jtc.categoryOrder",
      message: `categoryOrder must contain exactly 8 categories: ${expectedOrder.join(" → ")}.`,
    });
  } else {
    for (let i = 0; i < expectedOrder.length; i++) {
      if (config.jtc.categoryOrder[i] !== expectedOrder[i]) {
        errors.push({
          field: `jtc.categoryOrder[${i}]`,
          message: `Category at index ${i} must be "${expectedOrder[i]}", received: "${config.jtc.categoryOrder[i]}".`,
        });
      }
    }
  }

  // 5. JTC Categories Validation
  const seenCategoryIds = new Set<string>();
  for (const catName of expectedOrder) {
    const cat: JtcCategoryConfig | undefined = config.jtc.categories[catName];
    if (!cat) {
      errors.push({
        field: `jtc.categories.${catName}`,
        message: `Missing category configuration for "${catName}".`,
      });
      continue;
    }

    if (!isSnowflake(cat.categoryId)) {
      errors.push({
        field: `jtc.categories.${catName}.categoryId`,
        message: `Category ID for "${catName}" must be a valid Discord snowflake, received: "${cat.categoryId}".`,
      });
    } else if (seenCategoryIds.has(cat.categoryId)) {
      errors.push({
        field: `jtc.categories.${catName}.categoryId`,
        message: `Duplicate category ID detected: "${cat.categoryId}". Each category must have a unique ID.`,
      });
    } else {
      seenCategoryIds.add(cat.categoryId);
    }

    if (typeof cat.userLimit !== "number" || cat.userLimit < 1) {
      errors.push({
        field: `jtc.categories.${catName}.userLimit`,
        message: `userLimit for "${catName}" must be a positive integer, received: ${cat.userLimit}.`,
      });
    }
  }

  // 6. JTC Triggers Validation
  const triggerEntries = Object.entries(config.jtc.triggers) as [
    string,
    JtcTriggerConfig,
  ][];
  if (triggerEntries.length === 0) {
    errors.push({
      field: "jtc.triggers",
      message: "At least one JTC trigger voice channel must be configured.",
    });
  }

  const seenTriggerChannelIds = new Set<string>();
  for (const [key, trigger] of triggerEntries) {
    if (!isSnowflake(trigger.triggerChannelId)) {
      errors.push({
        field: `jtc.triggers[${key}].triggerChannelId`,
        message: `Trigger channel ID must be a valid Discord snowflake, received: "${trigger.triggerChannelId}".`,
      });
    } else if (seenTriggerChannelIds.has(trigger.triggerChannelId)) {
      errors.push({
        field: `jtc.triggers[${key}].triggerChannelId`,
        message: `Duplicate trigger channel ID detected: "${trigger.triggerChannelId}".`,
      });
    } else {
      seenTriggerChannelIds.add(trigger.triggerChannelId);
    }

    if (!config.jtc.categories[trigger.categoryName]) {
      errors.push({
        field: `jtc.triggers[${key}].categoryName`,
        message: `Trigger maps to unknown category name: "${trigger.categoryName}".`,
      });
    }

    if (!trigger.roomNameTemplate.includes("{number}")) {
      errors.push({
        field: `jtc.triggers[${key}].roomNameTemplate`,
        message: `roomNameTemplate must contain the "{number}" token, received: "${trigger.roomNameTemplate}".`,
      });
    }
  }

  // 7. Cleanup Validation
  if (
    typeof config.jtc.cleanup.delayMs !== "number" ||
    config.jtc.cleanup.delayMs < 0
  ) {
    errors.push({
      field: "jtc.cleanup.delayMs",
      message: "cleanup.delayMs must be a non-negative number.",
    });
  }
  if (
    typeof config.jtc.cleanup.maxRetries !== "number" ||
    config.jtc.cleanup.maxRetries < 0
  ) {
    errors.push({
      field: "jtc.cleanup.maxRetries",
      message: "cleanup.maxRetries must be a non-negative integer.",
    });
  }

  if (errors.length > 0) {
    throw new ConfigValidationError(errors);
  }
};
