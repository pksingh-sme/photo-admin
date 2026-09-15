import type { Logger } from 'drizzle-orm/logger';
import { isTenantOwnedTableName } from './schema/tenant-owned.js';

const TABLE_REF = /\b(?:from|join|update|into)\s+`([^`]+)`/gi;
const WHERE_END =
  /\b(?:order\s+by|group\s+by|limit|having|for\s+update|lock\s+in)\b/i;
const OEM_ID_IDENTIFIER = /`oem_id`|\boem_id\b/i;

export class UnscopedTenantQueryError extends Error {
  constructor(sql: string) {
    super(`Tenant-owned query is missing an oem_id predicate: ${sql}`);
    this.name = 'UnscopedTenantQueryError';
  }
}

/**
 * Non-production Drizzle logger. Runs before execute; throwing here prevents
 * the statement from reaching MySQL. (`FR-TEN-002`)
 *
 * oem_id in the SELECT list does not count — only a WHERE predicate does.
 */
export class TenantScopeQueryHook implements Logger {
  logQuery(query: string, params: unknown[]): void {
    void params;
    assertTenantOwnedQueryIsScoped(query);
  }
}

export function assertTenantOwnedQueryIsScoped(sql: string): void {
  if (!targetsTenantOwnedTable(sql)) {
    return;
  }

  if (isValuesInsert(sql)) {
    return;
  }

  const where = extractWhereClause(sql);
  if (where === undefined || !OEM_ID_IDENTIFIER.test(where)) {
    throw new UnscopedTenantQueryError(sql);
  }
}

function isValuesInsert(sql: string): boolean {
  const trimmed = sql.trimStart();
  return /^insert\b/i.test(trimmed) && !/\bselect\b/i.test(trimmed);
}

function targetsTenantOwnedTable(sql: string): boolean {
  TABLE_REF.lastIndex = 0;
  for (const match of sql.matchAll(TABLE_REF)) {
    const tableName = match[1];
    if (tableName !== undefined && isTenantOwnedTableName(tableName)) {
      return true;
    }
  }
  return false;
}

function extractWhereClause(sql: string): string | undefined {
  const whereAt = sql.search(/\bwhere\b/i);
  if (whereAt === -1) {
    return undefined;
  }

  const afterWhere = sql.slice(whereAt + 'where'.length);
  const endAt = afterWhere.search(WHERE_END);
  if (endAt === -1) {
    return afterWhere;
  }
  return afterWhere.slice(0, endAt);
}
