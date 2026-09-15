import type { Logger } from 'drizzle-orm/logger';
import { isTenantOwnedTableName } from './schema/tenant-owned.js';
import { getCallerOemId } from '../platform/tenant/caller-oem.js';

const TABLE_REF = /\b(?:from|join|update|into)\s+`([^`]+)`/gi;
const WHERE_END =
  /\b(?:order\s+by|group\s+by|limit|having|for\s+update|lock\s+in)\b/i;
const OEM_EQ_PARAM =
  /(?:`[^`]+`\.)?`oem_id`\s*=\s*\?|\b[A-Za-z0-9_]*\.?oem_id\s*=\s*\?/gi;
const OEM_ID_TOKEN = /`oem_id`|\boem_id\b/gi;

export class UnscopedTenantQueryError extends Error {
  constructor(message: string, readonly sql: string) {
    super(`${message}: ${sql}`);
    this.name = 'UnscopedTenantQueryError';
  }
}

/**
 * Non-production Drizzle logger. Runs before execute; throwing here prevents
 * the statement from reaching MySQL. (`FR-TEN-002`)
 *
 * Requires `oem_id = ?` (not a mere mention) with the bound value equal to
 * the caller OEM from `runWithCallerOem`. INSERT must include `oem_id` the
 * same way. Production does not attach this logger — see `createDb`.
 */
export class TenantScopeQueryHook implements Logger {
  logQuery(query: string, params: unknown[]): void {
    assertTenantOwnedQueryIsScoped(query, params);
  }
}

export function assertTenantOwnedQueryIsScoped(
  sql: string,
  params: readonly unknown[],
): void {
  if (!targetsTenantOwnedTable(sql)) {
    return;
  }

  const kind = statementKind(sql);
  if (kind === 'insert') {
    assertInsertBoundToCaller(sql, params);
    return;
  }

  assertWhereOemIdEqualsCaller(sql, params);

  if (kind === 'update') {
    assertUpdateDoesNotReassignOemId(sql, params);
  }
}

function statementKind(
  sql: string,
): 'select' | 'insert' | 'update' | 'delete' {
  const trimmed = sql.trimStart();
  if (/^replace\b/i.test(trimmed) || /^insert\b/i.test(trimmed)) {
    return 'insert';
  }
  if (/^update\b/i.test(trimmed)) {
    return 'update';
  }
  if (/^delete\b/i.test(trimmed)) {
    return 'delete';
  }
  return 'select';
}

function requireCallerOem(sql: string): string {
  const callerOem = getCallerOemId();
  if (callerOem === undefined || callerOem === '') {
    throw new UnscopedTenantQueryError(
      'Tenant-owned query executed without a caller OEM',
      sql,
    );
  }
  return callerOem;
}

function matchOemEqualities(text: string): RegExpMatchArray[] {
  return [...text.matchAll(new RegExp(OEM_EQ_PARAM.source, 'gi'))];
}

function assertWhereOemIdEqualsCaller(
  sql: string,
  params: readonly unknown[],
): void {
  const where = whereClause(sql);
  if (where === undefined) {
    throw new UnscopedTenantQueryError(
      'Tenant-owned query is missing an oem_id predicate',
      sql,
    );
  }

  const equalities = matchOemEqualities(where.text);
  if (equalities.length === 0) {
    const mentioned = new RegExp(OEM_ID_TOKEN.source, 'gi').test(where.text);
    throw new UnscopedTenantQueryError(
      mentioned
        ? 'Tenant-owned query must bind oem_id with an equality parameter, not merely mention it'
        : 'Tenant-owned query is missing an oem_id predicate',
      sql,
    );
  }

  const whereWithoutEqualities = where.text.replace(
    new RegExp(OEM_EQ_PARAM.source, 'gi'),
    '',
  );
  if (new RegExp(OEM_ID_TOKEN.source, 'gi').test(whereWithoutEqualities)) {
    throw new UnscopedTenantQueryError(
      'Tenant-owned query must bind oem_id with an equality parameter, not merely mention it',
      sql,
    );
  }

  const callerOem = requireCallerOem(sql);
  for (const match of equalities) {
    const bound = boundValueAtMatch(sql, params, match, where.start);
    if (bound !== callerOem) {
      throw new UnscopedTenantQueryError(
        `Tenant-owned query binds oem_id to ${String(bound)} but the caller OEM is ${callerOem}`,
        sql,
      );
    }
  }
}

function assertUpdateDoesNotReassignOemId(
  sql: string,
  params: readonly unknown[],
): void {
  const setAt = sql.search(/\bset\b/i);
  if (setAt === -1) {
    return;
  }
  const afterSet = sql.slice(setAt + 'set'.length);
  const whereAt = afterSet.search(/\bwhere\b/i);
  const setClause = whereAt === -1 ? afterSet : afterSet.slice(0, whereAt);
  const setStart = setAt + 'set'.length;

  const equalities = matchOemEqualities(setClause);
  if (equalities.length === 0) {
    return;
  }

  const callerOem = requireCallerOem(sql);
  for (const match of equalities) {
    const bound = boundValueAtMatch(sql, params, match, setStart);
    if (bound !== callerOem) {
      throw new UnscopedTenantQueryError(
        `Tenant-owned UPDATE must not reassign oem_id (bound ${String(bound)}, caller ${callerOem})`,
        sql,
      );
    }
  }
}

function assertInsertBoundToCaller(
  sql: string,
  params: readonly unknown[],
): void {
  if (isInsertSelect(sql)) {
    throw new UnscopedTenantQueryError(
      'Tenant-owned INSERT ... SELECT must go through scoped() so oem_id equals the caller',
      sql,
    );
  }

  const columns = parseInsertColumnList(sql);
  if (columns !== undefined) {
    const oemIndex = columns.indexOf('oem_id');
    if (oemIndex === -1) {
      throw new UnscopedTenantQueryError(
        'Tenant-owned INSERT must include oem_id bound to the caller OEM',
        sql,
      );
    }
    const width = columns.length;
    if (width === 0 || params.length % width !== 0 || params.length === 0) {
      throw new UnscopedTenantQueryError(
        'Tenant-owned INSERT must include oem_id bound to the caller OEM',
        sql,
      );
    }
    const callerOem = requireCallerOem(sql);
    for (let offset = 0; offset < params.length; offset += width) {
      const bound = params[offset + oemIndex];
      if (bound !== callerOem) {
        throw new UnscopedTenantQueryError(
          `Tenant-owned INSERT binds oem_id to ${String(bound)} but the caller OEM is ${callerOem}`,
          sql,
        );
      }
    }
    return;
  }

  if (isInsertSet(sql)) {
    const equalities = matchOemEqualities(sql);
    if (equalities.length === 0) {
      throw new UnscopedTenantQueryError(
        'Tenant-owned INSERT must include oem_id bound to the caller OEM',
        sql,
      );
    }
    const callerOem = requireCallerOem(sql);
    for (const match of equalities) {
      const bound = boundValueAtMatch(sql, params, match, 0);
      if (bound !== callerOem) {
        throw new UnscopedTenantQueryError(
          `Tenant-owned INSERT binds oem_id to ${String(bound)} but the caller OEM is ${callerOem}`,
          sql,
        );
      }
    }
    return;
  }

  throw new UnscopedTenantQueryError(
    'Tenant-owned INSERT must include oem_id bound to the caller OEM',
    sql,
  );
}

function boundValueAtMatch(
  sql: string,
  params: readonly unknown[],
  match: RegExpMatchArray,
  indexBase: number,
): unknown {
  const at = match.index;
  if (at === undefined) {
    return undefined;
  }
  const placeholderAt = indexBase + at + match[0].lastIndexOf('?');
  const paramIndex = countPlaceholders(sql.slice(0, placeholderAt));
  return params[paramIndex];
}

function countPlaceholders(sqlPrefix: string): number {
  return (sqlPrefix.match(/\?/g) ?? []).length;
}

function isInsertSelect(sql: string): boolean {
  const trimmed = sql.trimStart();
  return (
    /^(?:insert|replace)\b/i.test(trimmed) &&
    /\bselect\b/i.test(trimmed) &&
    !/\bvalues\b/i.test(trimmed)
  );
}

function isInsertSet(sql: string): boolean {
  return /^(?:insert|replace)\s+(?:ignore\s+)?into\s+`[^`]+`\s+set\b/i.test(
    sql.trimStart(),
  );
}

function parseInsertColumnList(sql: string): string[] | undefined {
  const match = sql
    .trimStart()
    .match(
      /^(?:insert|replace)\s+(?:ignore\s+)?into\s+`[^`]+`\s*\(([^)]*)\)/i,
    );
  const raw = match?.[1];
  if (raw === undefined) {
    return undefined;
  }
  return raw.split(',').map((column) => column.trim().replaceAll('`', '').toLowerCase());
}

function whereClause(sql: string): { text: string; start: number } | undefined {
  const whereAt = sql.search(/\bwhere\b/i);
  if (whereAt === -1) {
    return undefined;
  }

  const start = whereAt + 'where'.length;
  const afterWhere = sql.slice(start);
  const endAt = afterWhere.search(WHERE_END);
  const text = endAt === -1 ? afterWhere : afterWhere.slice(0, endAt);
  return { text, start };
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
