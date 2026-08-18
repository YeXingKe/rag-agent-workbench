import util from 'node:util';

type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

const LEVEL_COLORS: Record<LogLevel, string> = {
  DEBUG: '\u001b[36m',
  INFO: '\u001b[32m',
  WARNING: '\u001b[33m',
  ERROR: '\u001b[31m',
  CRITICAL: '\u001b[35m',
};

const RESET = '\u001b[0m';
const BOLD = '\u001b[1m';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function timestamp(): string {
  const now = new Date();
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  );
}

function colorize(level: LogLevel, enabled: boolean): string {
  if (!enabled) {
    return level;
  }
  const color = LEVEL_COLORS[level];
  return `${BOLD}${color}${level}${RESET}`;
}

function formatMessage(message: unknown, args: unknown[]): string {
  if (typeof message === 'string' && args.length > 0) {
    return util.format(message, ...args);
  }
  if (typeof message === 'string') {
    return message;
  }
  return util.format('%o', message);
}

export interface Logger {
  debug: (message: unknown, ...args: unknown[]) => void;
  info: (message: unknown, ...args: unknown[]) => void;
  warn: (message: unknown, ...args: unknown[]) => void;
  error: (message: unknown, ...args: unknown[]) => void;
  exception: (message: unknown, ...args: unknown[]) => void;
}

function write(name: string, level: LogLevel, stream: NodeJS.WriteStream, message: unknown, args: unknown[]): void {
  const useColor = Boolean(stream.isTTY);
  const line = `${timestamp()} | ${colorize(level, useColor)} | ${name} | ${formatMessage(message, args)}`;
  stream.write(`${line}\n`);
}

export function createLogger(name: string): Logger {
  return {
    debug(message: unknown, ...args: unknown[]) {
      write(name, 'DEBUG', process.stderr, message, args);
    },
    info(message: unknown, ...args: unknown[]) {
      write(name, 'INFO', process.stderr, message, args);
    },
    warn(message: unknown, ...args: unknown[]) {
      write(name, 'WARNING', process.stderr, message, args);
    },
    error(message: unknown, ...args: unknown[]) {
      write(name, 'ERROR', process.stderr, message, args);
    },
    exception(message: unknown, ...args: unknown[]) {
      write(name, 'ERROR', process.stderr, message, args);
      const last = args[args.length - 1];
      if (last instanceof Error && last.stack) {
        process.stderr.write(`${last.stack}\n`);
      }
    },
  };
}

let configured = false;

export function configureLogging(): void {
  if (configured) {
    return;
  }
  configured = true;
}

export const logger = createLogger('app');
