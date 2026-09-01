/**
 * PostgreSQL 连接池与会话管理
 *
 * 提供连接池单例、轻量 withClient，以及带 BEGIN/COMMIT/ROLLBACK 的 withSession。
 *
 * 注意：空闲连接被服务端断开时，Client 会触发 error 事件；
 * 若不监听，Node 会以 Unhandled 'error' event 直接退出进程。
 */
import pg from 'pg';

import { getSettings } from '../config/settings.js';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

/** 可执行 query 的对象：连接池或已借出的 client。 */
export type Queryable = pg.Pool | pg.PoolClient;

let pool: pg.Pool | null = null;

/** 判断是否为连接已断开类错误（回滚时不应再抛出掩盖业务错误）。 */
function isConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes('connection terminated') ||
    message.includes('connection ended') ||
    message.includes('client has encountered a connection error') ||
    message.includes('server closed the connection') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    (error as { code?: string }).code === '57P01' || // admin_shutdown
    (error as { code?: string }).code === '57P02' || // crash_shutdown
    (error as { code?: string }).code === '57P03' // cannot_connect_now
  );
}

/**
 * 获取 pg.Pool 单例。
 *
 * @throws 未配置 POSTGRES_DSN 时抛错
 */
export function getPool(): pg.Pool {
  if (pool) {
    return pool;
  }

  const settings = getSettings();
  if (!settings.postgresDsn) {
    throw new Error('POSTGRES_DSN is not configured');
  }

  pool = new Pool({
    connectionString: settings.postgresDsn,
    max: 15,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // 探测并维持 TCP 连接，降低被中间设备静默踢掉的概率
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    allowExitOnIdle: false,
  });

  // 空闲客户端意外断开时必须监听，否则会变成 Unhandled 'error' 并拖垮进程
  pool.on('error', (error) => {
    logger.warn(`PostgreSQL idle client error (pool will discard it): ${error.message}`);
  });

  return pool;
}

/**
 * 借用一个连接执行回调，结束后自动 release。
 * 不开启事务；适合单条查询或调用方自行管理事务。
 */
export async function withClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();

  // 借出期间连接中断时吞掉事件，避免 Unhandled 'error'；真实失败会在 query 上抛出
  const onClientError = (error: Error) => {
    logger.warn(`PostgreSQL checked-out client error: ${error.message}`);
  };
  client.on('error', onClientError);

  try {
    return await fn(client);
  } finally {
    client.removeListener('error', onClientError);
    try {
      client.release();
    } catch (releaseError) {
      // 连接已坏时 release 可能失败，忽略以免掩盖业务错误
      logger.warn(
        `PostgreSQL client release failed: ${releaseError instanceof Error ? releaseError.message : String(releaseError)
        }`,
      );
    }
  }
}

/**
 * 在事务中执行回调：成功 COMMIT，异常 ROLLBACK。
 */
export async function withSession<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  return withClient(async (client) => {
    await client.query('BEGIN'); // 开始一捆操作
    try {
      const result = await fn(client);
      await client.query('COMMIT'); // 提交事务
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK'); // 回滚事务
      } catch (rollbackError) {
        // 连接已断时 ROLLBACK 会失败；只记日志，继续抛出原始业务错误
        if (!isConnectionError(rollbackError)) {
          logger.warn(
            `PostgreSQL ROLLBACK failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
            }`,
          );
        }
      }
      throw error;
    }
  });
}

/** 会话工厂，便于依赖注入。 */
export interface SessionFactory {
  withClient: typeof withClient;
  withSession: typeof withSession;
}

/** 确保连接池已初始化，并返回会话工厂。 */
export function getSessionFactory(): SessionFactory {
  getPool();
  return { withClient, withSession };
}

/** 关闭连接池，便于进程优雅退出。 */
export async function closePool(): Promise<void> {
  if (!pool) {
    return;
  }
  await pool.end();
  pool = null;
}
