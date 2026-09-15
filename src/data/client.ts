import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import { createPool as createMysql2Pool, type Pool } from 'mysql2/promise';
import { TenantScopeQueryHook } from './tenant-scope-hook.js';

/**
 * DECIMAL, BIGINT and related values must arrive as strings. These flags are
 * applied after the caller config so they cannot be overridden.
 * Verify with the DECIMAL round-trip test; flipping them is silent otherwise.
 */
const DECIMAL_AS_STRING = {
  decimalNumbers: false,
  supportBigNumbers: true,
  bigNumberStrings: true,
} as const;

export type MysqlPoolConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

export function createPool(config: MysqlPoolConfig): Pool {
  return createMysql2Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ...DECIMAL_AS_STRING,
  });
}

export type Database = MySql2Database;

export function createDb(pool: Pool): Database {
  if (process.env['NODE_ENV'] === 'production') {
    return drizzle({ client: pool });
  }

  return drizzle({
    client: pool,
    logger: new TenantScopeQueryHook(),
  });
}
