/**
 * Console theme utility providing ANSI colors with automatic TTY and NO_COLOR detection.
 */

export interface ConsoleTheme {
  reset: (text: string) => string;
  bold: (text: string) => string;
  dim: (text: string) => string;
  red: (text: string) => string;
  green: (text: string) => string;
  yellow: (text: string) => string;
  blue: (text: string) => string;
  magenta: (text: string) => string;
  cyan: (text: string) => string;
  gray: (text: string) => string;
  isColorSupported: () => boolean;
}

const supportsColor = (): boolean => {
  if (typeof process === "undefined" || !process.stdout) {
    return false;
  }
  if (process.env.NO_COLOR != null && process.env.NO_COLOR !== "") {
    return false;
  }
  if (process.env.TERM === "dumb") {
    return false;
  }
  return Boolean(process.stdout.isTTY);
};

const ansi = (open: number, close: number) => {
  return (text: string): string => {
    if (!supportsColor()) return text;
    return `\x1b[${open}m${text}\x1b[${close}m`;
  };
};

export const theme: ConsoleTheme = {
  reset: ansi(0, 0),
  bold: ansi(1, 22),
  dim: ansi(2, 22),
  red: ansi(31, 39),
  green: ansi(32, 39),
  yellow: ansi(33, 39),
  blue: ansi(34, 39),
  magenta: ansi(35, 39),
  cyan: ansi(36, 39),
  gray: ansi(90, 39),
  isColorSupported: supportsColor,
};
