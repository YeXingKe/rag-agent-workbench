/**
 * PostgreSQL 连接池与会话管理
 *
 * 提供连接池单例、轻量 withClient，以及带 BEGIN/COMMIT/ROLLBACK 的 withSession。
 * 空闲连接断开必须监听 error，否则 Node 会 Unhandled 'error' 退出。
 */
import pg from 'pg'; // node-postgres

import { getSettings } from '../config/settings.js'; // 读 POSTGRES_DSN
import { logger } from '../utils/logger.js'; // 连接异常只记 warn

const { Pool } = pg; // 连接池构造器

/** 可执行 query 的对象：连接池或已借出的 client。 */
export type Queryable = pg.Pool | pg.PoolClient; // model 层用这个类型注入

let pool: pg.Pool | null = null; // 进程内连接池单例

/**
 * 判断是否为连接已断开类错误。
 * 回滚失败时若属于这类错误，不再二次抛出，以免掩盖业务异常。
 */
function isConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) { // 不是 Error 对象
    return false; // 不当成连接错误
  }
  const message = error.message.toLowerCase(); // 统一小写方便 includes
  return (
    message.includes('connection terminated') || // 连接被终止
    message.includes('connection ended') || // 连接已结束
    message.includes('client has encountered a connection error') || // 客户端连接错误
    message.includes('server closed the connection') || // 服务端关连接
    message.includes('econnreset') || // TCP reset
    message.includes('econnrefused') || // 拒绝连接
    (error as { code?: string }).code === '57P01' || // admin_shutdown
    (error as { code?: string }).code === '57P02' || // crash_shutdown
    (error as { code?: string }).code === '57P03' // cannot_connect_now
  );
}

/**
 * 获取 pg.Pool 单例。整个进程共用一个池。
 *
 * @throws 未配置 POSTGRES_DSN 时抛错
 */
export function getPool(): pg.Pool {
  if (pool) { // 已经建过
    return pool; // 复用
  }

  const settings = getSettings(); // 读环境配置
  if (!settings.postgresDsn) { // 没有连接串
    throw new Error('POSTGRES_DSN is not configured'); // 无法建池
  }

  pool = new Pool({ // 创建连接池
    connectionString: settings.postgresDsn, // postgresql://...
    max: 15, // 最多 15 条物理连接
    idleTimeoutMillis: 30_000, // 空闲 30 秒回收
    connectionTimeoutMillis: 5_000, // 借连接超过 5 秒失败
    keepAlive: true, // TCP keepalive
    keepAliveInitialDelayMillis: 10_000, // 10 秒后开始探测
    allowExitOnIdle: false, // 空闲时不要让进程以为可以退出
  });

  pool.on('error', (error) => { // 空闲客户端被踢必须听这个事件
    logger.warn(`PostgreSQL idle client error (pool will discard it): ${error.message}`); // 池会丢掉坏连接
  });

  return pool; // 返回单例
}

/**
 * 借用一个连接执行回调，结束后自动 release。
 * 不开启事务。
 */
export async function withClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect(); // 从池里借一条连接

  const onClientError = (error: Error) => { // 借出期间断线
    logger.warn(`PostgreSQL checked-out client error: ${error.message}`); // 只记日志，避免 Unhandled
  };
  client.on('error', onClientError); // 挂上监听

  try {
    return await fn(client); // 执行业务回调
  } finally {
    client.removeListener('error', onClientError); // 先摘监听再还连接
    try {
      client.release(); // 还给池，不是销毁
    } catch (releaseError) { // 连接已坏时 release 可能抛
      logger.warn( // 只 warn，不要盖住上面的业务错误
        `PostgreSQL client release failed: ${releaseError instanceof Error ? releaseError.message : String(releaseError)
        }`,
      );
    }
  }
}

/**
 * 在同一条连接上开事务：成功 COMMIT，异常 ROLLBACK。
 */
export async function withSession<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  return withClient(async (client) => { // 事务必须绑同一条连接
    await client.query('BEGIN'); // 开始事务
    try {
      const result = await fn(client); // 业务 SQL 都走这个 client
      await client.query('COMMIT'); // 成功则提交
      return result; // 把回调结果往外传
    } catch (error) { // 任一 SQL 或业务失败
      try {
        await client.query('ROLLBACK'); // 撤销本事务已写内容
      } catch (rollbackError) { // 连接已断时 ROLLBACK 会失败
        if (!isConnectionError(rollbackError)) { // 不是断线才打日志
          logger.warn(
            `PostgreSQL ROLLBACK failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
            }`,
          );
        }
      }
      throw error; // 始终抛出原始业务错误
    }
  });
}

/** 会话工厂，便于依赖注入。 */
export interface SessionFactory {
  withClient: typeof withClient; // 无事务借用
  withSession: typeof withSession; // 有事务借用
}

/** 确保连接池已初始化，并返回会话工厂。 */
export function getSessionFactory(): SessionFactory {
  getPool(); // 先把池建起来
  return { withClient, withSession }; // 交给 BM25 等模块
}

/** 关闭连接池并清空单例。 */
export async function closePool(): Promise<void> {
  if (!pool) { // 从没建过
    return; // 无需 end
  }
  await pool.end(); // 关掉所有连接
  pool = null; // 丢掉单例
}
