import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import { createPool as createMysql2Pool, type Pool } from 'mysql2/promise';
import { assertSchemaHasNoUnregisteredOemIdTables } from '../assert-registered.js';
import { TenantScopeQueryHook } from '../tenant-scope-hook.js';

/**
 * DECIMAL, BIGINT and related values must arrive as strings. These flags are
 * applied after the caller config so they cannot be overridden.
 * Verify with the DECIMAL round-trip test; flipping them is silent otherwise.
 *
 * This is the only mysql2 createPool call site. A second pool would bypass
 * these flags and the tenant-scope hook.
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
  // Runs in every environment, including production. A tenant-owned table
  // that skipped tenantOwned() is invisible to the per-query hook and must
  // not boot. (`FR-TEN-002`)
  assertSchemaHasNoUnregisteredOemIdTables();

  if (process.env['NODE_ENV'] === 'production') {
    // Per-query logging is off in production for cost. Isolation then
    // relies on R4's confinement of the raw client (only scoped() is
    // exported from src/data/) plus R2's assertTenantIsolation suite.
    // The assertion above is the only part of this hook that still runs
    // in production.
    return drizzle({ client: pool });
  }

  return drizzle({
    client: pool,
    logger: new TenantScopeQueryHook(),
  });
}
