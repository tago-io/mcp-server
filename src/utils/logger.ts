const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARNING: 2,
  ERROR: 3,
  SILENT: 4,
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

let currentLevel: LogLevel = "INFO";

function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function debug(...args: unknown[]): void {
  if (shouldLog("DEBUG")) {
    console.error("[DEBUG]", ...args);
  }
}

function info(...args: unknown[]): void {
  if (shouldLog("INFO")) {
    console.error("[INFO]", ...args);
  }
}

function warn(...args: unknown[]): void {
  if (shouldLog("WARNING")) {
    console.error("[WARNING]", ...args);
  }
}

function error(...args: unknown[]): void {
  if (shouldLog("ERROR")) {
    console.error("[ERROR]", ...args);
  }
}

const logger = { debug, info, warn, error, setLogLevel };

export { logger, LogLevel };
