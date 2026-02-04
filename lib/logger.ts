/**
 * Structured logger utility.
 *
 * - In production: JSON structured output for log aggregation.
 * - In development: human-readable colored output.
 *
 * Log level controlled by `LOG_LEVEL` env var.
 * Default: "debug" in development, "info" in production.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const COLORS: Record<LogLevel, string> = {
  debug: "\x1b[36m", // cyan
  info: "\x1b[32m",  // green
  warn: "\x1b[33m",  // yellow
  error: "\x1b[31m", // red
};

const RESET = "\x1b[0m";

function getMinLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && envLevel in LEVELS) {
    return envLevel as LogLevel;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[getMinLevel()];
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function formatDev(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): string {
  const color = COLORS[level];
  const label = level.toUpperCase().padEnd(5);
  const base = `${color}[${label}]${RESET} ${message}`;
  if (context && Object.keys(context).length > 0) {
    return `${base} ${JSON.stringify(context)}`;
  }
  return base;
}

function formatProd(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): string {
  const entry: Record<string, unknown> = {
    level,
    message,
    timestamp: new Date().toISOString(),
  };
  if (context && Object.keys(context).length > 0) {
    entry.context = context;
  }
  return JSON.stringify(entry);
}

function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  if (!shouldLog(level)) return;

  const output = isProduction()
    ? formatProd(level, message, context)
    : formatDev(level, message, context);

  switch (level) {
    case "error":
      console.error(output);
      break;
    case "warn":
      console.warn(output);
      break;
    default:
      console.log(output);
      break;
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) =>
    log("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) =>
    log("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) =>
    log("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) =>
    log("error", message, context),
};
