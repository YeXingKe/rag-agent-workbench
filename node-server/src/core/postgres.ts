/**
 * PostgreSQL 连接池与会话管理
 *
 * 提供连接池单例、轻量 withClient，以及带 BEGIN/COMMIT/ROLLBACK 的 withSession。
 */
import pg from 'pg';

import { getSettings } from '../config/settings.js';

const { Pool } = pg;

/** 可执行 query 的对象：连接池或已借出的 client。 */
export type Queryable = pg.Pool | pg.PoolClient;

let pool: pg.Pool | null = null;

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
  });

  return pool;
}

/**
 * 借用一个连接执行回调，结束后自动 release。
 * 不开启事务；适合单条查询或调用方自行管理事务。
 */
export async function withClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/**
 * 在事务中执行回调：成功 COMMIT，异常 ROLLBACK。
 */
export async function withSession<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  return withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
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
