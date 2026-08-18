import pg from 'pg';

import { getSettings } from '../config/settings.js';

const { Pool } = pg;

export type Queryable = pg.Pool | pg.PoolClient;

let pool: pg.Pool | null = null;

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

export async function withClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

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

export interface SessionFactory {
  withClient: typeof withClient;
  withSession: typeof withSession;
}

export function getSessionFactory(): SessionFactory {
  getPool();
  return { withClient, withSession };
}

export async function closePool(): Promise<void> {
  if (!pool) {
    return;
  }
  await pool.end();
  pool = null;
}
