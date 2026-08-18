/**
 * 简易彩色日志工具
 *
 * 输出到 stderr，TTY 下按级别着色；风格对齐 Python 侧 logger。
 */
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

/** TTY 下返回带 ANSI 颜色的级别标签。 */
function colorize(level: LogLevel, enabled: boolean): string {
  if (!enabled) {
    return level;
  }
  const color = LEVEL_COLORS[level];
  return `${BOLD}${color}${level}${RESET}`;
}

/** 支持 printf 风格占位符；非字符串用 %o 序列化。 */
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
  /** 记录错误；若末尾参数为 Error，额外打印 stack。 */
  exception: (message: unknown, ...args: unknown[]) => void;
}

function write(name: string, level: LogLevel, stream: NodeJS.WriteStream, message: unknown, args: unknown[]): void {
  const useColor = Boolean(stream.isTTY);
  const line = `${timestamp()} | ${colorize(level, useColor)} | ${name} | ${formatMessage(message, args)}`;
  stream.write(`${line}\n`);
}

/** 按模块名创建 logger 实例。 */
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

/**
 * 配置日志（幂等占位）。
 * 当前实现无需额外 handler，保留接口以对齐 Python 侧启动流程。
 */
export function configureLogging(): void {
  if (configured) {
    return;
  }
  configured = true;
}

/** 默认应用级 logger。 */
export const logger = createLogger('app');
