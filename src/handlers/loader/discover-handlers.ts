import fs from "node:fs";
import path from "node:path";

export interface DiscoverOptions {
  baseDir: string;
  allowedExtensions?: string[];
}

const DEFAULT_EXTENSIONS = [".handler.ts", ".handler.js", ".handler.mjs"];
const EXCLUDED_PATTERNS = [
  /\.d\.ts$/,
  /\.map$/,
  /\.test\.[jt]s$/,
  /\.spec\.[jt]s$/,
  /__tests__/,
  /node_modules/,
  /fixtures/,
];

export const isApprovedHandlerFile = (
  filePath: string,
  allowedExtensions = DEFAULT_EXTENSIONS,
): boolean => {
  const normalized = filePath.replace(/\\/g, "/");

  for (const pattern of EXCLUDED_PATTERNS) {
    if (pattern.test(normalized)) {
      return false;
    }
  }

  return allowedExtensions.some((ext) => normalized.endsWith(ext));
};

export const discoverHandlerFiles = async (
  dir: string,
  allowedExtensions = DEFAULT_EXTENSIONS,
): Promise<string[]> => {
  const discovered: string[] = [];

  if (!fs.existsSync(dir)) {
    return discovered;
  }

  const entries = await fs.promises.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!EXCLUDED_PATTERNS.some((pat) => pat.test(entry.name))) {
        const subFiles = await discoverHandlerFiles(
          fullPath,
          allowedExtensions,
        );
        discovered.push(...subFiles);
      }
    } else if (entry.isFile()) {
      if (isApprovedHandlerFile(fullPath, allowedExtensions)) {
        discovered.push(fullPath);
      }
    }
  }

  return discovered.sort();
};
